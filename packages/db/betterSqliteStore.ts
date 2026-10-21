import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { KarakeepDBTransaction } from "./index";
import type { ConstraintKind, KarakeepDB, LibraryStore } from "./libraryStore";
import { makeTransactionsAtomic } from "./atomicTransactions";
import { schema } from "./fullSchema";
import { instrumentDatabase } from "./instrumentation";

export interface BetterSqliteStoreOptions {
  /** Database file path, or ":memory:". */
  path: string;
  walMode?: boolean;
  /** Wrap statements in OpenTelemetry spans. */
  instrument?: boolean;
}

const CONSTRAINT_CODES: Record<ConstraintKind, string> = {
  unique: "SQLITE_CONSTRAINT_UNIQUE",
  primaryKey: "SQLITE_CONSTRAINT_PRIMARYKEY",
  foreignKey: "SQLITE_CONSTRAINT_FOREIGNKEY",
};

export function isBetterSqliteConstraintViolation(
  error: unknown,
  kind?: ConstraintKind,
): boolean {
  if (!(error instanceof Database.SqliteError)) return false;
  if (kind) return error.code === CONSTRAINT_CODES[kind];
  return error.code.startsWith("SQLITE_CONSTRAINT");
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
    >(raw);

    return {
      db,
      isConstraintViolation: isBetterSqliteConstraintViolation,
      migrate(migrationsFolder) {
        migrate(raw, { migrationsFolder });
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
