import { workerStatsCounter } from "metrics";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import {
  addLogFields,
  EmbeddingsQueue,
  zEmbeddingsRequestSchema,
} from "@karakeep/shared-server";
import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  getQueueClient,
  QueueRetryAfterError,
} from "@karakeep/shared/queueing";
import { getVectorStoreClient } from "@karakeep/shared/vectorStore";

export class EmbeddingCleanupWorker {
  static async build() {
    logger.info("Starting embedding cleanup worker ...");
    return (await getQueueClient()).createRunner<ZEmbeddingsRequest>(
      EmbeddingsQueue,
      {
        run: withWorkerTracing(
          "embeddingCleanupWorker.run",
          withWorkerEventLog("embeddingsWorker.run", async (job) => {
            addLogFields<"embeddingsWorker.run">({
              "bookmark.id": job.data.bookmarkId,
              "embedding.mode": job.data.type,
            });
            // This profile must never generate or index vectors, including
            // forced jobs. Preserve other work for a full-profile consumer.
            if (job.data.type !== "delete") {
              throw new QueueRetryAfterError(
                "Embedding cleanup only processes deletion jobs",
                60_000,
              );
            }
            const store = await getVectorStoreClient();
            if (store) await store.deleteVectors([job.data.bookmarkId]);
          }),
        ),
        onComplete: async () => {
          workerStatsCounter.labels("embeddingCleanup", "completed").inc();
        },
        onError: async (job) => {
          // Deferred non-deletion jobs are not failures and must not trigger
          // embedding-status changes or tagging fallback.
          if (job.data && job.data.type !== "delete") return;
          workerStatsCounter.labels("embeddingCleanup", "failed").inc();
          logger.error(
            `[embeddingCleanup][${job.id}] Cleanup failed: ${job.error}`,
          );
        },
      },
      {
        concurrency: serverConfig.embedding.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.embedding.jobTimeoutSec,
        validator: zEmbeddingsRequestSchema,
      },
    );
  }
}
