import "dotenv/config";

import path from "path";
import type Database from "better-sqlite3";

import serverConfig from "@karakeep/shared/config";

import {
  createBetterSqliteStore,
  isBetterSqliteConstraintViolation,
} from "./betterSqliteStore";
import dbConfig from "./drizzle.config";
import type { KarakeepDB } from "./libraryStore";
import { db, setDefaultLibraryStore } from "./libraryStore";

// Without an explicit binding, the runtime uses the Docker target's SQLite file.
setDefaultLibraryStore({
  create: () =>
    createBetterSqliteStore({
      path: dbConfig.dbCredentials.url,
      walMode: serverConfig.database.walMode,
      instrument: true,
      migrationsFolder: "./drizzle",
    }),
  isConstraintViolation: isBetterSqliteConstraintViolation,
});

export { db };
export { getLibraryStore } from "./libraryStore";
export type DB = typeof db;

/** Migration folder for tests; resolved lazily because `__dirname` only exists under Vitest and CommonJS bundles. */
export function getMigrationsFolder() {
  return path.resolve(__dirname, "./drizzle");
}

/**
 * Creates an in-memory database for tests and optionally runs migrations.
 * The native handle is closed before rethrowing if initialization fails.
 * `$client` is exposed so test setup can close the handle.
 */
export function getInMemoryDB(
  runMigrations: boolean,
): KarakeepDB & { $client: Database.Database } {
  const store = createBetterSqliteStore({
    path: ":memory:",
    migrationsFolder: runMigrations ? getMigrationsFolder() : undefined,
  });
  try {
    if (runMigrations) store.migrate();
    return store.db as KarakeepDB & { $client: Database.Database };
  } catch (error) {
    store.close();
    throw error;
  }
}
