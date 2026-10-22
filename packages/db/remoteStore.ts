import { drizzle } from "drizzle-orm/sqlite-proxy";

import type { KarakeepDB, LibraryStore } from "./libraryStore";
import { schema } from "./fullSchema";
import { isSqliteMessageConstraintViolation } from "./sqliteErrors";

/**
 * Wire protocol between the remote library store (a job running in a
 * Cloudflare Container) and the Durable Object that owns the database.
 * Everything is JSON; the schema has no blob columns.
 */
export type RemoteStoreRequest =
  | {
      kind: "query";
      sql: string;
      params: unknown[];
      method: "run" | "all" | "values" | "get";
    }
  | { kind: "persist"; name: string; input: unknown };

export type RemoteStoreResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { message: string } };

/** Sends one request to the library store and returns its response. */
export type RemoteStoreTransport = (
  request: RemoteStoreRequest,
) => Promise<RemoteStoreResponse>;

export const REMOTE_STORE_SECRET_HEADER = "x-marka-library-store-secret";

/** HTTP transport: POSTs requests as JSON with the shared secret. */
export function createHttpTransport(options: {
  fetch: (request: Request) => Promise<Response>;
  url: string;
  secret: string;
}): RemoteStoreTransport {
  return async (request) => {
    const response = await options.fetch(
      new Request(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [REMOTE_STORE_SECRET_HEADER]: options.secret,
        },
        body: JSON.stringify(request),
      }),
    );
    if (!response.ok && response.status !== 500) {
      throw new Error(
        `Library store request failed with HTTP ${response.status}`,
      );
    }
    return (await response.json()) as RemoteStoreResponse;
  };
}

async function call(
  send: RemoteStoreTransport,
  request: RemoteStoreRequest,
): Promise<unknown> {
  const response = await send(request);
  if (!response.ok) throw new Error(response.error.message);
  return response.result;
}

/**
 * Library store adapter for code that runs away from the database (ADR
 * 0011): queries travel one at a time, and `transaction()` is unavailable
 * because a transaction cannot stay open across requests. Work that must be
 * atomic goes through persist functions, which run where the database is.
 */
export function createRemoteLibraryStore(
  send: RemoteStoreTransport,
): LibraryStore {
  const raw = drizzle(
    async (sql, params, method) =>
      (await call(send, { kind: "query", sql, params, method })) as {
        rows: unknown[];
      },
    { schema },
  );

  const db = new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === "transaction") {
        return () => {
          throw new Error(
            "Transactions are not available on the remote library store; use a persist function.",
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as KarakeepDB;

  return {
    db,
    isConstraintViolation: isSqliteMessageConstraintViolation,
    migrate() {
      // The database owner applies migrations.
    },
    close() {
      // Nothing is held open between requests.
    },
    persist: (name, input) => call(send, { kind: "persist", name, input }),
  };
}
