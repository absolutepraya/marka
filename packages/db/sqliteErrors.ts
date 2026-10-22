import type { ConstraintKind } from "./libraryStore";

const EXTENDED_CODES: Record<ConstraintKind, string> = {
  unique: "SQLITE_CONSTRAINT_UNIQUE",
  primaryKey: "SQLITE_CONSTRAINT_PRIMARYKEY",
  foreignKey: "SQLITE_CONSTRAINT_FOREIGNKEY",
};

/**
 * Classifies SQLite constraint errors from their message, for adapters whose
 * errors are plain `Error`s: Durable Object SQLite reports
 * "... : SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_X)", and the remote
 * store relays that message. Drizzle may wrap the original as `cause`.
 */
export function isSqliteMessageConstraintViolation(
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
