import "dotenv/config";

import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import serverConfig from "@karakeep/shared/config";

import type { KarakeepDBTransaction } from "./index";
import { makeTransactionsAtomic } from "./atomicTransactions";
import * as collaborationScopeSchema from "./collaborationScopes";
import dbConfig from "./drizzle.config";
import { instrumentDatabase } from "./instrumentation";
import * as baseSchema from "./schema";

const schema = { ...baseSchema, ...collaborationScopeSchema };

const sqlite = new Database(dbConfig.dbCredentials.url);

if (serverConfig.database.walMode) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
} else {
  sqlite.pragma("journal_mode = DELETE");
}
sqlite.pragma("cache_size = -65536");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("temp_store = MEMORY");

instrumentDatabase(sqlite);

export const db = makeTransactionsAtomic<
  ReturnType<typeof drizzle<typeof schema>>,
  KarakeepDBTransaction
>(drizzle(sqlite, { schema }));
export type DB = typeof db;

/**
 * Creates an in-memory SQLite database for tests and optionally runs migrations.
 * The native handle is closed before rethrowing if initialization fails.
 */
export function getInMemoryDB(runMigrations: boolean) {
  const mem = new Database(":memory:");
  try {
    const raw = drizzle(mem, { schema, logger: false });
    if (runMigrations) {
      migrate(raw, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
    }
    return makeTransactionsAtomic<typeof raw, KarakeepDBTransaction>(raw);
  } catch (error) {
    if (mem.open) {
      mem.close();
    }
    throw error;
  }
}
