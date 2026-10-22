import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { LibraryStore } from "@karakeep/db";
import {
  bindLibraryStore,
  db,
  getLibraryStore,
  isConstraintViolation,
} from "@karakeep/db";
import { createBetterSqliteStore } from "@karakeep/db/betterSqliteStore";
import { getMigrationsFolder } from "@karakeep/db/drizzle";
import { bookmarkTags, users } from "@karakeep/db/schema";

const stores: LibraryStore[] = [];

function migratedStore() {
  const store = createBetterSqliteStore({ path: ":memory:" });
  stores.push(store);
  store.migrate(getMigrationsFolder());
  return store;
}

async function captureError(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the query to fail");
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("library store", () => {
  it("routes the db handle to the bound store", async () => {
    const store = migratedStore();
    bindLibraryStore(store);

    await db.insert(users).values({ name: "A", email: "a@test.com" });

    expect(getLibraryStore()).toBe(store);
    expect(await store.db.$count(users)).toBe(1);
  });

  it("joins handle calls to a transaction on the bound store", async () => {
    bindLibraryStore(migratedStore());

    await expect(
      db.transaction(async () => {
        await db.insert(users).values({ name: "A", email: "a@test.com" });
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.$count(users)).toBe(0);
  });

  it("classifies constraint violations by kind", async () => {
    const store = migratedStore();
    bindLibraryStore(store);
    const [user] = await db
      .insert(users)
      .values({ name: "A", email: "a@test.com" })
      .returning();

    const unique = await captureError(() =>
      db.insert(users).values({ name: "B", email: "a@test.com" }),
    );
    expect(isConstraintViolation(unique)).toBe(true);
    expect(isConstraintViolation(unique, "unique")).toBe(true);
    expect(isConstraintViolation(unique, "primaryKey")).toBe(false);

    const primaryKey = await captureError(() =>
      db.insert(users).values({ id: user.id, name: "C", email: "c@test.com" }),
    );
    expect(isConstraintViolation(primaryKey, "primaryKey")).toBe(true);

    const foreignKey = await captureError(() =>
      db.insert(bookmarkTags).values({ name: "tag", userId: "missing-user" }),
    );
    expect(isConstraintViolation(foreignKey, "foreignKey")).toBe(true);
    expect(store.isConstraintViolation(foreignKey, "unique")).toBe(false);

    expect(isConstraintViolation(new Error("UNIQUE constraint failed"))).toBe(
      false,
    );
  });

  it("migrates and queries through the store interface", async () => {
    const store = migratedStore();
    await store.db.insert(users).values({ name: "A", email: "a@test.com" });

    const found = await store.db.query.users.findFirst({
      where: eq(users.email, "a@test.com"),
    });
    expect(found?.name).toBe("A");
  });
});
