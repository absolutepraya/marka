import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { TablesRelationalConfig } from "drizzle-orm";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from "drizzle-orm";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import {
  SQLiteDOPreparedQuery,
  SQLiteDOSession,
  SQLiteDOTransaction,
} from "drizzle-orm/durable-sqlite/session";

import type { KarakeepDBTransaction } from "@karakeep/db";
import type { TransactionDriver } from "@karakeep/db/atomicTransactions";
import { makeTransactionsAtomic } from "@karakeep/db/atomicTransactions";
import { schema } from "@karakeep/db/fullSchema";
import type {
  ConstraintKind,
  KarakeepDB,
  LibraryStore,
} from "@karakeep/db/libraryStore";

import migrationBundle from "./migrations.generated";

/** Same shape better-sqlite3 returns for writes; 34 callers read `changes`. */
interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

// Drizzle's Durable Object driver returns nothing from writes. Read SQLite's
// own counters right after the statement so `changes` matches better-sqlite3.
class CountingPreparedQuery extends SQLiteDOPreparedQuery {
  override run(placeholderValues?: Record<string, unknown>): RunResult {
    super.run(placeholderValues);
    const client = (this as unknown as { client: DurableObjectStorage }).client;
    const row = client.sql
      .exec<{ changes: number; lastInsertRowid: number }>(
        "SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid",
      )
      .one();
    return { changes: row.changes, lastInsertRowid: row.lastInsertRowid };
  }
}

type DOSession = SQLiteDOSession<
  Record<string, unknown>,
  TablesRelationalConfig
>;

class CountingSession extends SQLiteDOSession<
  Record<string, unknown>,
  TablesRelationalConfig
> {
  override prepareQuery(...args: Parameters<DOSession["prepareQuery"]>) {
    const [query, fields, executeMethod, isResponseInArrayMode, mapper] = args;
    const internals = this as unknown as {
      client: DurableObjectStorage;
      logger: ConstructorParameters<typeof SQLiteDOPreparedQuery>[2];
    };
    return new CountingPreparedQuery(
      internals.client,
      query,
      internals.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      mapper,
    );
  }
}

const EXTENDED_CODES: Record<ConstraintKind, string> = {
  unique: "SQLITE_CONSTRAINT_UNIQUE",
  primaryKey: "SQLITE_CONSTRAINT_PRIMARYKEY",
  foreignKey: "SQLITE_CONSTRAINT_FOREIGNKEY",
};

// Errors arrive as "... : SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_X)",
// sometimes wrapped by Drizzle with the original error as `cause`.
export function isDurableSqliteConstraintViolation(
  error: unknown,
  kind?: ConstraintKind,
): boolean {
  for (let current = error; current instanceof Error; ) {
    const extended = /\(extended: (SQLITE_CONSTRAINT_\w+)\)/.exec(
      current.message,
    )?.[1];
    if (extended) return kind ? extended === EXTENDED_CODES[kind] : true;
    if (!kind && /\bSQLITE_CONSTRAINT\b/.test(current.message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function createDurableTransactionDriver(
  storage: DurableObjectStorage,
  dialect: SQLiteSyncDialect,
  session: CountingSession,
  relationalSchema: ConstructorParameters<typeof SQLiteDOTransaction>[3],
): TransactionDriver {
  return {
    // SQL statements, including those issued after an `await`, belong to the
    // open storage transaction and roll back together if the body throws.
    // While it is open, the runtime defers events from outside it (including
    // timers), so a body must not wait on work started elsewhere.
    runTransaction: (body) => storage.transaction(() => body()),
    runSavepoint: (_name, body) => storage.transaction(() => body()),
    createTransaction(depth) {
      return new SQLiteDOTransaction(
        "sync",
        dialect,
        session,
        relationalSchema,
        depth,
      );
    },
  };
}

/**
 * Library store adapter for the Cloudflare hosting target: one SQLite-backed
 * Durable Object per installation (ADR 0011).
 */
export function createDurableSqliteStore(
  storage: DurableObjectStorage,
): LibraryStore {
  const dialect = new SQLiteSyncDialect();
  const tablesConfig = extractTablesRelationalConfig(
    schema,
    createTableRelationsHelpers,
  );
  const relationalSchema = {
    fullSchema: schema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  };
  const session = new CountingSession(storage, dialect, relationalSchema, {});
  const raw = new DrizzleSqliteDODatabase(
    "sync",
    dialect,
    session,
    relationalSchema,
  ) as DrizzleSqliteDODatabase<typeof schema> & {
    $client: DurableObjectStorage;
  };
  raw.$client = storage;

  const db = makeTransactionsAtomic<typeof raw, KarakeepDBTransaction>(
    raw,
    createDurableTransactionDriver(storage, dialect, session, relationalSchema),
  ) as unknown as KarakeepDB;

  return {
    db,
    isConstraintViolation: isDurableSqliteConstraintViolation,
    async migrate() {
      // Fresh installs start from the bundled baseline schema and record the
      // baseline migrations as applied; copied databases keep their history.
      storage.transactionSync(() => {
        storage.sql.exec(
          `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`,
        );
        const { count } = storage.sql
          .exec<{ count: number }>(
            `SELECT count(*) AS count FROM "__drizzle_migrations"`,
          )
          .one();
        if (count > 0) return;
        for (const statement of migrationBundle.baseline.statements) {
          storage.sql.exec(statement);
        }
        for (const createdAt of migrationBundle.baseline.applied) {
          storage.sql.exec(
            `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES ('', ?)`,
            createdAt,
          );
        }
      });
      await migrate(raw, migrationBundle);
    },
    close() {
      // The runtime owns the Durable Object's storage lifecycle.
    },
  };
}
