import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { KarakeepDBTransaction } from "./index";
import type { AtomicTransactionMethod } from "./atomicTransactions";
import type { schema } from "./fullSchema";

/**
 * The library store is the single authoritative record of an installation's
 * users, bookmarks, lists, and permissions (see CONTEXT.md). Every runtime
 * binds exactly one adapter at startup; callers keep using the `db` handle.
 *
 * Queries stay in Drizzle. The interface owns what differs between drivers:
 * transactions, constraint-error classification, migrations, and lifecycle.
 */
export type KarakeepDB = AtomicTransactionMethod<KarakeepDBTransaction> &
  BetterSQLite3Database<typeof schema>;

export type ConstraintKind = "unique" | "primaryKey" | "foreignKey";

export interface LibraryStore {
  /** Drizzle database whose `transaction()` is atomic across `await`. */
  readonly db: KarakeepDB;
  /**
   * True when `error` is a constraint violation raised by this store. With a
   * `kind`, only that kind of violation matches.
   */
  isConstraintViolation(error: unknown, kind?: ConstraintKind): boolean;
  /** Applies pending migrations from the given folder. */
  migrate(migrationsFolder: string): void;
  close(): void;
}

/** The adapter a runtime falls back to when nothing was bound explicitly. */
export interface DefaultLibraryStore {
  create(): LibraryStore;
  /** Classifies errors without opening a connection. */
  isConstraintViolation: LibraryStore["isConstraintViolation"];
}

let bound: LibraryStore | undefined;
let fallback: DefaultLibraryStore | undefined;

/**
 * Binds the library store for this runtime. Call once at startup, before the
 * first query; tests may rebind between cases.
 */
export function bindLibraryStore(store: LibraryStore): void {
  bound = store;
}

/** Registers the adapter used when nothing was bound explicitly. */
export function setDefaultLibraryStore(store: DefaultLibraryStore): void {
  fallback = store;
}

export function getLibraryStore(): LibraryStore {
  if (!bound) {
    if (!fallback) {
      throw new Error(
        "No library store is bound. Call bindLibraryStore() at startup.",
      );
    }
    bound = fallback.create();
  }
  return bound;
}

/** See {@link LibraryStore.isConstraintViolation}. */
export function isConstraintViolation(
  error: unknown,
  kind?: ConstraintKind,
): boolean {
  if (bound) return bound.isConstraintViolation(error, kind);
  if (fallback) return fallback.isConstraintViolation(error, kind);
  return getLibraryStore().isConstraintViolation(error, kind);
}

/**
 * Handle to the bound library store's database. Resolved on each access, so
 * modules can import it before startup binding has run.
 */
export const db: KarakeepDB = new Proxy({} as KarakeepDB, {
  get(_target, prop) {
    const target = getLibraryStore().db;
    return Reflect.get(target, prop, target);
  },
  has(_target, prop) {
    return Reflect.has(getLibraryStore().db, prop);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(getLibraryStore().db);
  },
});
