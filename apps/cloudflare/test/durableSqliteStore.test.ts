import { env, runInDurableObject } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@karakeep/db/libraryStore";
import { bookmarkTags, users } from "@karakeep/db/schema";

import type { LibraryStoreObject } from "../src/libraryStore/libraryStoreObject";
import migrationBundle from "../src/libraryStore/migrations.generated";

let counter = 0;

// Each test gets a fresh Durable Object, so stores never share state.
function runInStore<R>(
  fn: (
    instance: LibraryStoreObject,
    state: DurableObjectState,
  ) => R | Promise<R>,
): Promise<R> {
  const stub = env.LIBRARY_STORE.get(
    env.LIBRARY_STORE.idFromName(`test-${++counter}`),
  );
  return runInDurableObject(stub, fn);
}

function newUser(name: string) {
  return { name, email: `${name}@test.com` };
}

async function userNames(instance: LibraryStoreObject) {
  const rows = await instance.store.db
    .select({ name: users.name })
    .from(users)
    .orderBy(users.name);
  return rows.map((row) => row.name);
}

describe("Durable Object library store", () => {
  it("applies every migration", async () => {
    await runInStore((_instance, state) => {
      const applied = state.storage.sql
        .exec<{ count: number }>(
          "SELECT count(*) AS count FROM __drizzle_migrations",
        )
        .one().count;
      expect(applied).toBe(
        migrationBundle.baseline.applied.length +
          migrationBundle.journal.entries.length,
      );
    });
  });

  it("rolls back statements issued after an await", async () => {
    await runInStore(async (instance) => {
      await expect(
        instance.store.db.transaction(async (tx) => {
          await tx.insert(users).values(newUser("a"));
          await new Promise((resolve) => setTimeout(resolve, 1));
          await tx.insert(users).values(newUser("b"));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await userNames(instance)).toEqual([]);
    });
  });

  it("commits every statement when the callback succeeds", async () => {
    await runInStore(async (instance) => {
      await instance.store.db.transaction(async (tx) => {
        await tx.insert(users).values(newUser("a"));
        await new Promise((resolve) => setTimeout(resolve, 1));
        await tx.insert(users).values(newUser("b"));
      });
      expect(await userNames(instance)).toEqual(["a", "b"]);
    });
  });

  it("keeps outside writes out of an open transaction", async () => {
    await runInStore(async (instance) => {
      const failing = instance.store.db.transaction(async (tx) => {
        await tx.insert(users).values(newUser("inside"));
        await Promise.resolve();
        await Promise.resolve();
        throw new Error("boom");
      });
      // Queued while the transaction holds the lock, from outside it.
      const outside = Promise.resolve(
        instance.store.db.insert(users).values(newUser("outside")),
      );

      await expect(failing).rejects.toThrow("boom");
      await outside;
      expect(await userNames(instance)).toEqual(["outside"]);
    });
  });

  it("lets the bound db handle join the surrounding transaction", async () => {
    await runInStore(async (instance) => {
      await expect(
        instance.store.db.transaction(async () => {
          await db.insert(users).values(newUser("a"));
          await Promise.resolve();
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await userNames(instance)).toEqual([]);
    });
  });

  it("serializes concurrent read-then-write transactions", async () => {
    await runInStore(async (instance) => {
      const insertNext = () =>
        instance.store.db.transaction(async (tx) => {
          const count = await tx.$count(users);
          await new Promise((resolve) => setTimeout(resolve, 1));
          await tx.insert(users).values(newUser(`user-${count + 1}`));
        });
      await Promise.all([insertNext(), insertNext(), insertNext()]);
      expect(await userNames(instance)).toEqual(["user-1", "user-2", "user-3"]);
    });
  });

  it("turns a nested transaction into a savepoint", async () => {
    await runInStore(async (instance) => {
      await instance.store.db.transaction(async (tx) => {
        await tx.insert(users).values(newUser("outer"));
        await expect(
          tx.transaction(async (inner) => {
            await inner.insert(users).values(newUser("inner"));
            await Promise.resolve();
            throw new Error("inner failed");
          }),
        ).rejects.toThrow("inner failed");
      });
      expect(await userNames(instance)).toEqual(["outer"]);
    });
  });

  it("returns better-sqlite3 style run results", async () => {
    await runInStore(async (instance) => {
      await instance.store.db.insert(users).values(newUser("a"));
      const updated = await instance.store.db
        .update(users)
        .set({ name: "renamed" })
        .where(eq(users.name, "a"));
      expect(updated.changes).toBe(1);
      const missed = await instance.store.db
        .update(users)
        .set({ name: "nobody" })
        .where(eq(users.name, "missing"));
      expect(missed.changes).toBe(0);
      await instance.store.db.insert(users).values(newUser("b"));
      const raw = await instance.store.db.run(
        sql`UPDATE ${users} SET name = 'x'`,
      );
      expect(raw.changes).toBe(2);
    });
  });

  it("classifies constraint violations by kind", async () => {
    await runInStore(async (instance) => {
      const store = instance.store;
      const [user] = await store.db
        .insert(users)
        .values(newUser("a"))
        .returning();

      const capture = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (error) {
          return error;
        }
        throw new Error("expected the query to fail");
      };

      const unique = await capture(() =>
        store.db.insert(users).values({ name: "b", email: "a@test.com" }),
      );
      expect(store.isConstraintViolation(unique)).toBe(true);
      expect(store.isConstraintViolation(unique, "unique")).toBe(true);
      expect(store.isConstraintViolation(unique, "primaryKey")).toBe(false);

      const primaryKey = await capture(() =>
        store.db.insert(users).values({ ...newUser("c"), id: user.id }),
      );
      expect(store.isConstraintViolation(primaryKey, "primaryKey")).toBe(true);
      expect(store.isConstraintViolation(primaryKey, "unique")).toBe(false);

      const foreignKey = await capture(() =>
        store.db
          .insert(bookmarkTags)
          .values({ name: "tag", userId: "missing-user" }),
      );
      expect(store.isConstraintViolation(foreignKey, "foreignKey")).toBe(true);
      const notNull = await capture(async () =>
        store.db.run(sql`INSERT INTO ${users} (id) VALUES ('no-name')`),
      );
      expect(store.isConstraintViolation(notNull)).toBe(true);
      expect(store.isConstraintViolation(notNull, "unique")).toBe(false);
      expect(store.isConstraintViolation(new Error("unrelated"))).toBe(false);
    });
  });

  it("supports relational queries and counts", async () => {
    await runInStore(async (instance) => {
      await instance.store.db.insert(users).values(newUser("a"));
      const found = await instance.store.db.query.users.findFirst({
        where: eq(users.email, "a@test.com"),
      });
      expect(found?.name).toBe("a");
      expect(await instance.store.db.$count(users)).toBe(1);
    });
  });
});
