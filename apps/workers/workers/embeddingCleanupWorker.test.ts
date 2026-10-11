import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import type { Queue, QueueClient, Runner } from "@karakeep/shared/queueing";
import { LitequeQueueProvider } from "../../../packages/plugins/queue-liteque/src";

import { EmbeddingCleanupWorker } from "./embeddingCleanupWorker";

const state = vi.hoisted(() => ({
  dataDir: "",
  queue: undefined as Queue<ZEmbeddingsRequest> | undefined,
  client: undefined as QueueClient | undefined,
  store: null as { deleteVectors: ReturnType<typeof vi.fn> } | null,
}));
vi.mock("@karakeep/shared/config", () => ({
  default: {
    get dataDir() {
      return state.dataDir;
    },
    database: { walMode: false },
    embedding: { numWorkers: 1, jobTimeoutSec: 5 },
  },
}));
vi.mock("@karakeep/shared/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("metrics", () => ({
  workerStatsCounter: { labels: () => ({ inc: vi.fn() }) },
}));
vi.mock("workerTracing", () => ({
  withWorkerTracing: (_name: string, run: unknown) => run,
  withWorkerEventLog: (_name: string, run: unknown) => run,
}));
vi.mock("@karakeep/shared/queueing", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/queueing")>()),
  getQueueClient: async () => state.client,
}));
vi.mock("@karakeep/shared/vectorStore", () => ({
  getVectorStoreClient: async () => state.store,
}));
vi.mock("@karakeep/shared-server", async () => {
  const { zEmbeddingsRequestSchema } =
    await import("../../../packages/shared-server/src/queues");
  return {
    addLogFields: vi.fn(),
    zEmbeddingsRequestSchema,
    get EmbeddingsQueue() {
      return state.queue;
    },
  };
});

let runner: Runner<ZEmbeddingsRequest> | undefined;
let running: Promise<void> | undefined;
beforeEach(async () => {
  state.dataDir = await mkdtemp(path.join(tmpdir(), "marka-cleanup-test-"));
  state.client = (await new LitequeQueueProvider().getClient())!;
  await state.client.prepare();
  state.queue = state.client.createQueue("embeddings_queue", {
    defaultJobArgs: { numRetries: 3 },
    keepFailedJobs: true,
  });
  state.store = { deleteVectors: vi.fn().mockResolvedValue(undefined) };
});
afterEach(async () => {
  runner?.stop();
  await running;
  runner = undefined;
  running = undefined;
  await rm(state.dataDir, { recursive: true, force: true });
});

describe("embedding cleanup worker", () => {
  it("drains deletion jobs while preserving forced generation and indexing jobs without using retries", async () => {
    await state.queue!.enqueue(
      {
        type: "embed",
        bookmarkId: "generate",
        force: true,
        runTaggingOnComplete: true,
      },
      { groupId: "user" },
    );
    await state.queue!.enqueue(
      { type: "index", bookmarkId: "index", userId: "user", embedding: [1] },
      { groupId: "user" },
    );
    await state.queue!.enqueue(
      { type: "delete", bookmarkId: "deleted" },
      { groupId: "user" },
    );
    runner = await EmbeddingCleanupWorker.build();
    running = runner.run();
    await vi.waitFor(
      async () => {
        const stats = await state.queue!.stats();
        expect(stats.running).toBe(0);
        expect(stats.pending_retry).toBe(2);
        expect(stats.pending).toBe(0);
      },
      { timeout: 3_000 },
    );
    expect(state.store!.deleteVectors).toHaveBeenCalledExactlyOnceWith([
      "deleted",
    ]);
    const db = new Database(path.join(state.dataDir, "queue.db"), {
      readonly: true,
    });
    try {
      const remaining = db
        .prepare(
          "SELECT json_extract(payload, '$.type') AS type, numRunsLeft, maxNumRuns FROM tasks ORDER BY id",
        )
        .all();
      expect(remaining).toEqual([
        { type: "embed", numRunsLeft: 4, maxNumRuns: 4 },
        { type: "index", numRunsLeft: 4, maxNumRuns: 4 },
      ]);
    } finally {
      db.close();
    }
  });

  it("acknowledges deletion jobs when no vector store is configured", async () => {
    state.store = null;
    await state.queue!.enqueue({ type: "delete", bookmarkId: "deleted" });
    runner = await EmbeddingCleanupWorker.build();
    await runner.runUntilEmpty!();
    expect(await state.queue!.stats()).toMatchObject({
      pending: 0,
      running: 0,
      failed: 0,
    });
  });

  it("retries a failed vector deletion instead of losing the cleanup job", async () => {
    state.store!.deleteVectors.mockRejectedValueOnce(
      new Error("Temporary vector store outage"),
    );
    await state.queue!.enqueue({ type: "delete", bookmarkId: "deleted" });
    runner = await EmbeddingCleanupWorker.build();
    await runner.runUntilEmpty!();
    expect(state.store!.deleteVectors).toHaveBeenCalledTimes(2);
    expect(await state.queue!.stats()).toMatchObject({
      pending: 0,
      running: 0,
      failed: 0,
    });
  });
});
