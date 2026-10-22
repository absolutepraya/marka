import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import type { AtomicTransactionMethod } from "./atomicTransactions";
import type { schema as transactionSchema } from "./fullSchema";

export { listCollaborationScopes } from "./collaborationScopes";
export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export {
  bindLibraryStore,
  getLibraryStore,
  isConstraintViolation,
} from "./libraryStore";
export type { ConstraintKind, KarakeepDB, LibraryStore } from "./libraryStore";

// This is exported here to avoid leaking better-sqlite types outside of this package.
// `transaction()` on it opens an atomic savepoint; see atomicTransactions.ts.
export type KarakeepDBTransaction =
  AtomicTransactionMethod<KarakeepDBTransaction> &
    SQLiteTransaction<
      "sync",
      Database.RunResult,
      typeof transactionSchema,
      ExtractTablesWithRelations<typeof transactionSchema>
    >;
export type { AtomicTransactionConfig } from "./atomicTransactions";
