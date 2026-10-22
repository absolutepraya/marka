import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, describe, expect, it } from "vitest";

import { makeTransactionsAtomic } from "@karakeep/db/atomicTransactions";
import { createBetterSqliteTransactionDriver } from "@karakeep/db/betterSqliteStore";

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
  return makeTransactionsAtomic<typeof raw, Tx>(
    raw,
    createBetterSqliteTransactionDriver(raw),
  );
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
    // Let the transaction take the lock before the outside insert is built.
    await new Promise((resolve) => setTimeout(resolve, 1));
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

  it("keeps the original error when the rollback itself fails", async () => {
    const db = createDb();
    await db.insert(items).values({ name: "existing" });
    let iterator: IterableIterator<unknown> | undefined;

    await expect(
      db.transaction(async () => {
        // An open iterator keeps the connection busy, so ROLLBACK throws.
        iterator = db.$client.prepare("select * from items").iterate();
        iterator.next();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    iterator?.return?.();
    if (db.$client.inTransaction) db.$client.exec("ROLLBACK");
  });

  it("holds the write lock from the start against other connections", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "atomic-tx-"));
    const file = path.join(dir, "db.db");
    const setup = new Database(file);
    setup.exec(
      "create table items (id integer primary key autoincrement, name text not null)",
    );
    setup.close();
    const raw = drizzle(new Database(file), { schema });
    type Tx = Parameters<Parameters<typeof raw.transaction>[0]>[0];
    const db = makeTransactionsAtomic<typeof raw, Tx>(
      raw,
      createBetterSqliteTransactionDriver(raw),
    );
    // Stands in for the other process (web or workers) sharing the file.
    const other = new Database(file, { timeout: 20 });
    try {
      await db.transaction(async (tx) => {
        await tx.$count(items);
        // A deferred transaction would only hold a read lock here, letting
        // the other connection write and making the insert below fail with
        // SQLITE_BUSY.
        expect(() => other.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);
        await tx.insert(items).values({ name: "after read" });
      });
      expect(await names(db)).toEqual(["after read"]);
    } finally {
      other.close();
      raw.$client.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
