import { AsyncLocalStorage } from "node:async_hooks";
import { entityKind } from "drizzle-orm";

/**
 * Drizzle's SQLite drivers (better-sqlite3 and Durable Objects) run
 * transactions synchronously: they commit as soon as the callback returns, so
 * an `async` callback commits at its first `await` and every later statement
 * runs outside the transaction. This module replaces `transaction()` with one
 * that stays open across `await`; a {@link TransactionDriver} supplies the
 * driver-specific begin, commit, rollback, and savepoint steps.
 *
 * The connection is shared by every request in the process, so an open
 * transaction must not absorb unrelated statements. Transactions and all
 * queries started outside a transaction are serialized through one async
 * lock. Code running inside a transaction's async context (tracked with
 * AsyncLocalStorage) joins it, including calls made through the global `db`;
 * a nested `transaction()` becomes a savepoint.
 */

export interface AtomicTransactionConfig {
  /**
   * Used by the better-sqlite3 driver; the Durable Object driver runs one
   * transaction at a time regardless. Defaults to "immediate": the write lock
   * is taken up front. A deferred
   * transaction that reads first cannot upgrade to a write while another
   * process (web or workers) is writing, and SQLite then fails with
   * SQLITE_BUSY at once instead of waiting.
   */
  behavior?: "deferred" | "immediate" | "exclusive";
}

/**
 * The transaction method installed on the database and on every transaction.
 * Always resolves after COMMIT (or ROLLBACK) has run.
 */
export interface AtomicTransactionMethod<TTx> {
  transaction<T>(
    callback: (tx: TTx) => T | Promise<T>,
    config?: AtomicTransactionConfig,
  ): Promise<T>;
}

/**
 * Driver-specific transaction primitives. The engine owns locking, async
 * context tracking, and query gating; a driver only opens and closes
 * transactions on its connection.
 */
export interface TransactionDriver {
  /**
   * Runs `body` as a top-level transaction: commits when it resolves and rolls
   * back when it rejects, rethrowing the original error.
   */
  runTransaction<T>(
    body: () => Promise<T>,
    config: AtomicTransactionConfig | undefined,
  ): Promise<T>;
  /** Runs `body` as a named savepoint inside the open transaction. */
  runSavepoint<T>(name: string, body: () => Promise<T>): Promise<T>;
  /** Creates the driver's Drizzle transaction object for the given depth. */
  createTransaction(depth: number): object;
}

interface Scope {
  // False once the owning transaction or savepoint has finished, so detached
  // work started inside it no longer bypasses the lock.
  active: boolean;
  nested: AsyncLock;
  depth: number;
}

class AsyncLock {
  private tail: Promise<void> = Promise.resolve();
  private holders = 0;

  get held() {
    return this.holders > 0;
  }

  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await previous;
    this.holders++;
    try {
      return await fn();
    } finally {
      this.holders--;
      release();
    }
  }
}

// Methods that execute synchronously instead of returning a promise. On
// builder stages (e.g. `insert(table)`), `values` builds the query instead.
const SYNC_EXECUTORS = new Set(["all", "get", "run", "values", "sync"]);
// Database members whose plain-object results hand out query builders.
const BUILDER_BAGS = new Set(["query", "with"]);

function isEntity(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const ctor = (value as { constructor?: unknown }).constructor;
  return typeof ctor === "function" && entityKind in ctor;
}

function entityKindOf(value: object): unknown {
  return (value.constructor as unknown as Record<symbol, unknown>)[entityKind];
}

// Builder stages (e.g. `SQLiteInsertBuilder`) only produce query objects.
function isBuilderStage(value: object): boolean {
  const kind = entityKindOf(value);
  return typeof kind === "string" && kind.endsWith("Builder");
}

function isQueryObject(value: unknown): value is object {
  if (!isEntity(value)) return false;
  if (typeof (value as { then?: unknown }).then === "function") return true;
  return isBuilderStage(value);
}

/**
 * Wraps a Drizzle SQLite database so that `transaction()` is atomic across
 * `await`. The returned object is used exactly like the original.
 */
export function makeTransactionsAtomic<TDb extends object, TTx>(
  database: TDb,
  driver: TransactionDriver,
): AtomicTransactionMethod<TTx> & TDb {
  const lock = new AsyncLock();
  const scopes = new AsyncLocalStorage<Scope>();

  const insideTransaction = () => scopes.getStore()?.active === true;

  function assertSyncAllowed() {
    if (lock.held && !insideTransaction()) {
      throw new Error(
        "Synchronous database calls are not allowed while another request holds a transaction; await the query instead.",
      );
    }
  }

  async function runTopLevel<T>(
    callback: (tx: TTx) => T | Promise<T>,
    config: AtomicTransactionConfig | undefined,
  ): Promise<T> {
    return lock.run(async () => {
      const scope: Scope = { active: true, nested: new AsyncLock(), depth: 0 };
      try {
        return await driver.runTransaction(
          () =>
            scopes.run(scope, async () => callback(createTransactionHandle(0))),
          config,
        );
      } finally {
        scope.active = false;
      }
    });
  }

  async function runSavepoint<T>(
    parent: Scope,
    callback: (tx: TTx) => T | Promise<T>,
  ): Promise<T> {
    // Sibling savepoints in one transaction must not interleave.
    return parent.nested.run(async () => {
      const scope: Scope = {
        active: true,
        nested: new AsyncLock(),
        depth: parent.depth + 1,
      };
      try {
        return await driver.runSavepoint(`atomic_sp_${scope.depth}`, () =>
          scopes.run(scope, async () =>
            callback(createTransactionHandle(scope.depth)),
          ),
        );
      } finally {
        scope.active = false;
      }
    });
  }

  function transaction<T>(
    callback: (tx: TTx) => T | Promise<T>,
    config?: AtomicTransactionConfig,
  ): Promise<T> {
    const scope = scopes.getStore();
    if (scope?.active) return runSavepoint(scope, callback);
    return runTopLevel(callback, config);
  }

  function createTransactionHandle(depth: number): TTx {
    return wrap(driver.createTransaction(depth)) as TTx;
  }

  // Some query objects (e.g. `$count`) only implement `then`, so execution
  // always goes through the original `then`.
  function gatedThen(
    target: object,
    originalThen: PromiseLike<unknown>["then"],
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) {
    if (insideTransaction()) {
      return originalThen.call(target, onFulfilled, onRejected);
    }
    return lock
      .run(
        () =>
          new Promise<unknown>((resolve, reject) => {
            originalThen.call(target, resolve, reject);
          }),
      )
      .then(onFulfilled, onRejected);
  }

  const cache = new WeakMap<object, object>();

  function wrapResult(value: unknown): unknown {
    return isQueryObject(value) ? wrap(value) : value;
  }

  function wrapBag(bag: object): object {
    return new Proxy(bag, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value === "function") {
          return (...args: unknown[]) =>
            wrapResult(Reflect.apply(value, target, args));
        }
        return wrapResult(value);
      },
    });
  }

  function wrap<T extends object>(target: T): T {
    const cached = cache.get(target);
    if (cached) return cached as T;
    const proxy = new Proxy(target, {
      get(obj, prop) {
        if (prop === "transaction") return transaction;
        const originalThen = Reflect.get(obj, "then", obj) as unknown;
        if (prop === "then" && typeof originalThen === "function") {
          return (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) =>
            gatedThen(
              obj,
              originalThen as PromiseLike<unknown>["then"],
              onFulfilled,
              onRejected,
            );
        }
        if (prop === "catch" && typeof originalThen === "function") {
          return (onRejected?: (reason: unknown) => unknown) =>
            (proxy as unknown as Promise<unknown>).then(undefined, onRejected);
        }
        if (prop === "finally" && typeof originalThen === "function") {
          return (onFinally?: () => void) =>
            (proxy as unknown as Promise<unknown>).then(
              (value) => {
                onFinally?.();
                return value;
              },
              (reason) => {
                onFinally?.();
                throw reason;
              },
            );
        }

        const value = Reflect.get(obj, prop, obj);
        if (prop === "constructor" || typeof prop === "symbol") return value;
        if (prop === "$client") return value;

        if (typeof value === "function") {
          return (...args: unknown[]) => {
            if (SYNC_EXECUTORS.has(prop) && !isBuilderStage(obj)) {
              assertSyncAllowed();
            }
            const result = Reflect.apply(value, obj, args);
            if (BUILDER_BAGS.has(prop) && isPlainObject(result)) {
              return wrapBag(result);
            }
            return wrapResult(result);
          };
        }
        if (BUILDER_BAGS.has(prop) && isPlainObject(value)) {
          return wrapBag(value);
        }
        return value;
      },
    });
    cache.set(target, proxy);
    return proxy;
  }

  return wrap(database) as AtomicTransactionMethod<TTx> & TDb;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
