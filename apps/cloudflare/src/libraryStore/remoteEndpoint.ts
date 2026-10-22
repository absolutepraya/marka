import { runPersist } from "@karakeep/db/persist";
import type { JsonValue } from "@karakeep/db/persist";
import type {
  RemoteStoreRequest,
  RemoteStoreResponse,
} from "@karakeep/db/remoteStore";
import { REMOTE_STORE_SECRET_HEADER } from "@karakeep/db/remoteStore";

const encoder = new TextEncoder();

// Constant-time comparison, so response timing does not reveal the secret.
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = encoder.encode(given);
  const b = encoder.encode(expected);
  let difference = a.byteLength ^ b.byteLength;
  for (let i = 0; i < b.byteLength; i++) {
    difference |= (a[i] ?? 0) ^ b[i];
  }
  return difference === 0;
}

function json(body: RemoteStoreResponse, status: number) {
  return Response.json(body, { status });
}

function runQuery(
  storage: DurableObjectStorage,
  request: Extract<RemoteStoreRequest, { kind: "query" }>,
): unknown {
  const params = request.params as SqlStorageValue[];
  const cursor = storage.sql.exec(request.sql, ...params);
  switch (request.method) {
    case "run": {
      cursor.toArray();
      const counters = storage.sql
        .exec<{ changes: number; lastInsertRowid: number }>(
          "SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid",
        )
        .one();
      return { rows: [], ...counters };
    }
    case "get":
      return { rows: Array.from(cursor.raw())[0] };
    default:
      return { rows: Array.from(cursor.raw()) };
  }
}

/**
 * Serves the remote library store (ADR 0011) for jobs running in Containers.
 * Only reachable through the Durable Object binding, and only with the shared
 * secret; with no secret configured it refuses every request.
 *
 * Queries run directly on storage. They cannot interleave with an open
 * library store transaction, because the runtime defers incoming requests
 * while `storage.transaction()` is open.
 */
export async function handleRemoteStoreRequest(
  request: Request,
  storage: DurableObjectStorage,
  secret: string | undefined,
): Promise<Response> {
  if (!secret) {
    return json(
      { ok: false, error: { message: "Remote library store is disabled" } },
      503,
    );
  }
  if (!secretMatches(request.headers.get(REMOTE_STORE_SECRET_HEADER), secret)) {
    return json({ ok: false, error: { message: "Forbidden" } }, 403);
  }

  const body = (await request.json()) as RemoteStoreRequest;
  try {
    const result =
      body.kind === "query"
        ? runQuery(storage, body)
        : await runPersist(body.name, body.input as JsonValue);
    return json({ ok: true, result }, 200);
  } catch (error) {
    return json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
      500,
    );
  }
}
