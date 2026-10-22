import Database from "better-sqlite3";
import { BetterSQLiteTransaction, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import logger from "@karakeep/shared/logger";

import type { KarakeepDBTransaction } from "./index";
import type { ConstraintKind, KarakeepDB, LibraryStore } from "./libraryStore";
import type { TransactionDriver } from "./atomicTransactions";
import { makeTransactionsAtomic } from "./atomicTransactions";
import { schema } from "./fullSchema";
import { instrumentDatabase } from "./instrumentation";

export interface BetterSqliteStoreOptions {
  /** Database file path, or ":memory:". */
  path: string;
  walMode?: boolean;
  /** Wrap statements in OpenTelemetry spans. */
  instrument?: boolean;
  /** Folder of Drizzle migrations applied by `migrate()`. */
  migrationsFolder?: string;
}

const BEGIN_STATEMENTS = {
  deferred: "BEGIN DEFERRED",
  immediate: "BEGIN IMMEDIATE",
  exclusive: "BEGIN EXCLUSIVE",
} as const;

type BetterSqliteDrizzle = ReturnType<typeof drizzle> & {
  dialect: ConstructorParameters<typeof BetterSQLiteTransaction>[1];
  session: ConstructorParameters<typeof BetterSQLiteTransaction>[2] & {
    schema: ConstructorParameters<typeof BetterSQLiteTransaction>[3];
  };
};

/**
 * Transaction driver using explicit BEGIN, COMMIT, and SAVEPOINT statements on
 * a better-sqlite3 connection.
 */
export function createBetterSqliteTransactionDriver(
  database: ReturnType<typeof drizzle>,
): TransactionDriver {
  const internals = database as BetterSqliteDrizzle;
  const client = internals.$client;
  const exec = (statement: string) => client.prepare(statement).run();

  // Rollback failures are logged so they never replace the original error.
  function rollbackQuietly(statements: string[]) {
    if (!client.inTransaction) return;
    try {
      for (const statement of statements) exec(statement);
    } catch (rollbackError) {
      logger.error(
        `[db] ${statements[0]} failed after a transaction error: ${String(rollbackError)}`,
      );
    }
  }

  return {
    async runTransaction(body, config) {
      exec(BEGIN_STATEMENTS[config?.behavior ?? "immediate"]);
      try {
        const result = await body();
        exec("COMMIT");
        return result;
      } catch (error) {
        // SQLite may already have rolled back after some errors.
        rollbackQuietly(["ROLLBACK"]);
        throw error;
      }
    },
    async runSavepoint(name, body) {
      exec(`SAVEPOINT ${name}`);
      try {
        const result = await body();
        exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        rollbackQuietly([
          `ROLLBACK TO SAVEPOINT ${name}`,
          `RELEASE SAVEPOINT ${name}`,
        ]);
        throw error;
      }
    },
    createTransaction(depth) {
      return new BetterSQLiteTransaction(
        "sync",
        internals.dialect,
        internals.session,
        internals.session.schema,
        depth,
      );
    },
  };
}

const CONSTRAINT_CODES: Record<ConstraintKind, string> = {
  unique: "SQLITE_CONSTRAINT_UNIQUE",
  primaryKey: "SQLITE_CONSTRAINT_PRIMARYKEY",
  foreignKey: "SQLITE_CONSTRAINT_FOREIGNKEY",
};

// Drizzle may wrap driver errors, keeping the original as `cause`.
export function isBetterSqliteConstraintViolation(
  error: unknown,
  kind?: ConstraintKind,
): boolean {
  for (let current = error; current instanceof Error; ) {
    if (current instanceof Database.SqliteError) {
      if (kind) return current.code === CONSTRAINT_CODES[kind];
      return current.code.startsWith("SQLITE_CONSTRAINT");
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Library store adapter for the Docker hosting target. */
export function createBetterSqliteStore(
  options: BetterSqliteStoreOptions,
): LibraryStore {
  const client = new Database(options.path);
  try {
    if (options.walMode) {
      client.pragma("journal_mode = WAL");
      client.pragma("synchronous = NORMAL");
    } else {
      client.pragma("journal_mode = DELETE");
    }
    client.pragma("cache_size = -65536");
    client.pragma("foreign_keys = ON");
    client.pragma("temp_store = MEMORY");
    if (options.instrument) instrumentDatabase(client);

    const raw = drizzle(client, { schema, logger: false });
    const db: KarakeepDB = makeTransactionsAtomic<
      typeof raw,
      KarakeepDBTransaction
    >(raw, createBetterSqliteTransactionDriver(raw));

    return {
      db,
      isConstraintViolation: isBetterSqliteConstraintViolation,
      migrate() {
        if (!options.migrationsFolder) {
          throw new Error("No migrations folder configured for this store.");
        }
        migrate(raw, { migrationsFolder: options.migrationsFolder });
      },
      close() {
        if (client.open) client.close();
      },
    };
  } catch (error) {
    if (client.open) client.close();
    throw error;
  }
}
