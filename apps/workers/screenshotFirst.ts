import "dotenv/config";

import { buildServer } from "server";

import {
  AssetPreprocessingQueue,
  BackupQueue,
  EmbeddingsQueue,
  FeedQueue,
  initEventLogger,
  initTracing,
  LinkCrawlerQueue,
  loadAllPlugins,
  LowPriorityCrawlerQueue,
  OpenAIQueue,
  prepareQueue,
  RuleEngineQueue,
  SearchIndexingQueue,
  TranscriptQueue,
  shutdownEventLogger,
  shutdownTracing,
  startQueue,
  WebhookQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { shutdownPromise } from "./exit";
import {
  SCREENSHOT_FIRST_IMPORT_WORKER,
  SCREENSHOT_FIRST_QUEUE_WORKERS,
} from "./workerProfiles";
import { AssetPreprocessingWorker } from "./workers/assetPreprocessingWorker";
import { BackupSchedulingWorker, BackupWorker } from "./workers/backupWorker";
import { CrawlerWorker } from "./workers/crawlerWorker";
import { EmbeddingCleanupWorker } from "./workers/embeddingCleanupWorker";
import { FeedRefreshingWorker, FeedWorker } from "./workers/feedWorker";
import { OpenAiWorker } from "./workers/inference/inferenceWorker";
import { ImportWorker } from "./workers/importWorker";
import { RuleEngineWorker } from "./workers/ruleEngineWorker";
import { SearchIndexingWorker } from "./workers/searchWorker";
import { TranscriptWorker } from "./workers/transcriptWorker";
import { WebhookWorker } from "./workers/webhookWorker";

type QueueWorkerName = (typeof SCREENSHOT_FIRST_QUEUE_WORKERS)[number];
type WorkerName = QueueWorkerName | typeof SCREENSHOT_FIRST_IMPORT_WORKER;

const workerBuilders = {
  crawler: async () => {
    await LinkCrawlerQueue.ensureInit();
    return CrawlerWorker.build(LinkCrawlerQueue);
  },
  lowPriorityCrawler: async () => {
    await LowPriorityCrawlerQueue.ensureInit();
    return CrawlerWorker.build(LowPriorityCrawlerQueue);
  },
  inference: async () => {
    await OpenAIQueue.ensureInit();
    return OpenAiWorker.build();
  },
  search: async () => {
    await SearchIndexingQueue.ensureInit();
    return SearchIndexingWorker.build();
  },
  feed: async () => {
    await FeedQueue.ensureInit();
    return FeedWorker.build();
  },
  ruleEngine: async () => {
    await RuleEngineQueue.ensureInit();
    return RuleEngineWorker.build();
  },
  webhook: async () => {
    await WebhookQueue.ensureInit();
    return WebhookWorker.build();
  },
  backup: async () => {
    await BackupQueue.ensureInit();
    return BackupWorker.build();
  },
  assetPreprocessing: async () => {
    await AssetPreprocessingQueue.ensureInit();
    return AssetPreprocessingWorker.build();
  },
  transcript: async () => {
    await TranscriptQueue.ensureInit();
    return TranscriptWorker.build();
  },
  embeddingCleanup: async () => {
    await EmbeddingsQueue.ensureInit();
    return EmbeddingCleanupWorker.build();
  },
} as const;

const enabledWorkers = new Set(serverConfig.workers.enabledWorkers);
const disabledWorkers = new Set(serverConfig.workers.disabledWorkers);
const screenshotFirstWorkers: Record<WorkerName, true> = {
  crawler: true,
  lowPriorityCrawler: true,
  inference: true,
  search: true,
  feed: true,
  ruleEngine: true,
  webhook: true,
  backup: true,
  assetPreprocessing: true,
  transcript: true,
  embeddingCleanup: true,
  import: true,
};

if (process.env.WORKERS_ENABLED_WORKERS !== undefined) {
  for (const workerName of enabledWorkers) {
    if (!Object.hasOwn(screenshotFirstWorkers, workerName)) {
      throw new Error(`Unsupported screenshot-first worker: ${workerName}`);
    }
  }
}

function isWorkerEnabled(name: WorkerName) {
  if (enabledWorkers.size > 0 && !enabledWorkers.has(name)) {
    return false;
  }
  if (disabledWorkers.has(name)) {
    return false;
  }
  return true;
}

async function main() {
  await loadAllPlugins();
  initTracing("workers");
  initEventLogger("workers");
  logger.info(`Workers version: ${serverConfig.serverVersion ?? "not set"}`);
  await prepareQueue();

  const httpServer = buildServer();

  const workers = await Promise.all(
    SCREENSHOT_FIRST_QUEUE_WORKERS.filter(isWorkerEnabled).map(
      async (name) => ({
        name,
        worker: await workerBuilders[name](),
      }),
    ),
  );

  await startQueue();

  if (workers.some((w) => w.name === "feed")) {
    FeedRefreshingWorker.start();
  }

  if (workers.some((w) => w.name === "backup")) {
    BackupSchedulingWorker.start();
  }

  let importWorker: ImportWorker | null = null;
  let importWorkerPromise: Promise<void> | null = null;
  if (isWorkerEnabled(SCREENSHOT_FIRST_IMPORT_WORKER)) {
    importWorker = new ImportWorker();
    importWorkerPromise = importWorker.start();
  }

  const runningWorkers = workers.map(({ worker }) => worker.run());
  httpServer.setReady(true);

  await Promise.any([
    Promise.all([
      ...runningWorkers,
      httpServer.serve(),
      ...(importWorkerPromise ? [importWorkerPromise] : []),
    ]),
    shutdownPromise,
  ]);

  httpServer.setReady(false);

  logger.info(
    `Shutting down ${workers.map((w) => w.name).join(", ")} workers ...`,
  );

  if (workers.some((w) => w.name === "feed")) {
    FeedRefreshingWorker.stop();
  }
  if (workers.some((w) => w.name === "backup")) {
    BackupSchedulingWorker.stop();
  }
  if (importWorker) {
    importWorker.stop();
  }
  for (const { worker } of workers) {
    worker.stop();
  }
  await CrawlerWorker.shutdown();
  await httpServer.stop();
  await shutdownEventLogger();
  await shutdownTracing();
  process.exit(0);
}

main();
