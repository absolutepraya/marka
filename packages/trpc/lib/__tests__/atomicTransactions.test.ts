import Database from "better-sqlite3";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, describe, expect, it } from "vitest";

import { makeTransactionsAtomic } from "@karakeep/db/atomicTransactions";

const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});
const schema = { items };

const openClients: Database.Database[] = [];

function createDb() {
  const client = new Database(":memory:");
  openClients.push(client);
  client.exec(
    "create table items (id integer primary key autoincrement, name text not null)",
  );
  const raw = drizzle(client, { schema });
  type Tx = Parameters<Parameters<typeof raw.transaction>[0]>[0];
  return makeTransactionsAtomic<typeof raw, Tx>(raw);
}

type TestDb = ReturnType<typeof createDb>;

async function names(db: TestDb) {
  const rows = await db.select().from(items).orderBy(asc(items.id));
  return rows.map((row) => row.name);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  for (const client of openClients.splice(0)) client.close();
});

describe("makeTransactionsAtomic", () => {
  it("rolls back statements issued after an await", async () => {
    const db = createDb();

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(items).values({ name: "first" });
        await Promise.resolve();
        await tx.insert(items).values({ name: "second" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await names(db)).toEqual([]);
  });

  it("commits every statement when the callback succeeds", async () => {
    const db = createDb();

    const result = await db.transaction(async (tx) => {
      await tx.insert(items).values({ name: "first" });
      await new Promise((resolve) => setTimeout(resolve, 1));
      await tx.insert(items).values({ name: "second" });
      return "done";
    });

    expect(result).toBe("done");
    expect(await names(db)).toEqual(["first", "second"]);
  });

  it("keeps outside writes out of an open transaction", async () => {
    const db = createDb();
    const gate = deferred();

    const failing = db.transaction(async (tx) => {
      await tx.insert(items).values({ name: "inside" });
      await gate.promise;
      throw new Error("boom");
    });
    // Started while the transaction is open, from another async context.
    const outside = Promise.resolve(
      db.insert(items).values({ name: "outside" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    gate.resolve();

    await expect(failing).rejects.toThrow("boom");
    await outside;
    expect(await names(db)).toEqual(["outside"]);
  });

  it("lets the global handle join the surrounding transaction", async () => {
    const db = createDb();

    await expect(
      db.transaction(async () => {
        await db.insert(items).values({ name: "via global" });
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await names(db)).toEqual([]);
  });

  it("serializes concurrent read-then-write transactions", async () => {
    const db = createDb();

    const insertNext = () =>
      db.transaction(async (tx) => {
        const count = await tx.$count(items);
        await new Promise((resolve) => setTimeout(resolve, 1));
        await tx.insert(items).values({ name: `item-${count + 1}` });
      });
    await Promise.all([insertNext(), insertNext(), insertNext()]);

    expect(await names(db)).toEqual(["item-1", "item-2", "item-3"]);
  });

  it("turns a nested transaction into a savepoint", async () => {
    const db = createDb();

    await db.transaction(async (tx) => {
      await tx.insert(items).values({ name: "outer" });
      await expect(
        tx.transaction(async (inner) => {
          await inner.insert(items).values({ name: "inner" });
          await Promise.resolve();
          throw new Error("inner failed");
        }),
      ).rejects.toThrow("inner failed");
      await db.transaction(async (inner) => {
        await inner.insert(items).values({ name: "nested via global" });
      });
    });

    expect(await names(db)).toEqual(["outer", "nested via global"]);
  });

  it("runs synchronous callbacks atomically", async () => {
    const db = createDb();

    const id = await db.transaction(
      (tx) => {
        const row = tx.insert(items).values({ name: "sync" }).returning().get();
        return row.id;
      },
      { behavior: "immediate" },
    );

    expect(id).toBe(1);
    expect(await names(db)).toEqual(["sync"]);
  });

  it("rejects synchronous queries from outside an open transaction", async () => {
    const db = createDb();
    const gate = deferred();

    const open = db.transaction(async () => {
      await gate.promise;
    });
    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(() => db.select().from(items).all()).toThrow(
      /Synchronous database calls/,
    );
    gate.resolve();
    await open;
    expect(db.select().from(items).all()).toEqual([]);
  });

  it("supports relational queries, counts, and catch chains", async () => {
    const db = createDb();
    await db.insert(items).values([{ name: "a" }, { name: "b" }]);

    const found = await db.query.items.findFirst({
      where: (item, { eq }) => eq(item.name, "b"),
    });
    expect(found?.name).toBe("b");
    expect(await db.$count(items)).toBe(2);
    await db
      .select()
      .from(items)
      .catch(() => {
        throw new Error("unexpected");
      });
  });
});
