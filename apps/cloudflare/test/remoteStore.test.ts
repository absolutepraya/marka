import { env, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { definePersist } from "@karakeep/db/persist";
import {
  createHttpTransport,
  createRemoteLibraryStore,
} from "@karakeep/db/remoteStore";
import { bookmarkTags, users } from "@karakeep/db/schema";

import { REMOTE_STORE_PATH } from "../src/libraryStore/libraryStoreObject";

// Registered in this isolate, which the Durable Object shares under Vitest.
const renameAll = definePersist<{ name: string }, { renamed: number }>(
  "test.renameAll",
  (db, { name }) =>
    db.transaction(async (tx) => {
      const result = await tx.update(users).set({ name });
      return { renamed: result.changes };
    }),
);

let counter = 0;

function connect(secret = "test-secret") {
  const stub = env.LIBRARY_STORE.get(
    env.LIBRARY_STORE.idFromName(`remote-${++counter}`),
  );
  const store = createRemoteLibraryStore(
    createHttpTransport({
      fetch: (request) => stub.fetch(request),
      url: `https://library-store${REMOTE_STORE_PATH}`,
      secret,
    }),
  );
  return { stub, store };
}

async function capture(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

describe("remote library store", () => {
  it("runs queries against the Durable Object", async () => {
    const { store } = connect();
    const [created] = await store.db
      .insert(users)
      .values({ name: "a", email: "a@test.com" })
      .returning();
    expect(created.email).toBe("a@test.com");

    const updated = await store.db
      .update(users)
      .set({ name: "renamed" })
      .where(eq(users.id, created.id));
    expect(updated.changes).toBe(1);

    const found = await store.db.query.users.findFirst({
      where: eq(users.id, created.id),
    });
    expect(found?.name).toBe("renamed");
    expect(await store.db.$count(users)).toBe(1);
    const rows = await store.db.select({ name: users.name }).from(users);
    expect(rows).toEqual([{ name: "renamed" }]);
  });

  it("classifies constraint errors relayed over the wire", async () => {
    const { store } = connect();
    const [user] = await store.db
      .insert(users)
      .values({ name: "a", email: "a@test.com" })
      .returning();

    const unique = await capture(() =>
      store.db.insert(users).values({ name: "b", email: "a@test.com" }),
    );
    expect(store.isConstraintViolation(unique, "unique")).toBe(true);
    const primaryKey = await capture(() =>
      store.db
        .insert(users)
        .values({ id: user.id, name: "c", email: "c@test.com" }),
    );
    expect(store.isConstraintViolation(primaryKey, "primaryKey")).toBe(true);
    const foreignKey = await capture(() =>
      store.db.insert(bookmarkTags).values({ name: "t", userId: "missing" }),
    );
    expect(store.isConstraintViolation(foreignKey, "foreignKey")).toBe(true);
  });

  it("refuses transactions and runs persist functions remotely", async () => {
    const { stub, store } = connect();
    expect(() => store.db.transaction(async () => undefined)).toThrow(
      /persist function/,
    );

    await store.db.insert(users).values([
      { name: "a", email: "a@test.com" },
      { name: "b", email: "b@test.com" },
    ]);
    expect(await store.persist!("test.renameAll", { name: "x" })).toEqual({
      renamed: 2,
    });
    // The persist function ran inside the Durable Object's own store.
    await runInDurableObject(stub, async (instance) => {
      const rows = await instance.store.db.select().from(users);
      expect(rows.map((row) => row.name)).toEqual(["x", "x"]);
    });
    expect(renameAll).toBeTypeOf("function");
  });

  it("rejects requests without the shared secret", async () => {
    const { store } = connect("wrong-secret");
    const error = await capture(() => store.db.select().from(users));
    // Drizzle wraps transport errors, keeping the original as `cause`.
    expect(String((error as Error).cause)).toMatch(/HTTP 403/);
  });

  it("does not expose the endpoint on other paths or methods", async () => {
    const { stub } = connect();
    const response = await stub.fetch(
      `https://library-store${REMOTE_STORE_PATH}`,
    );
    expect(response.status).toBe(404);
  });
});
