export const SCREENSHOT_FIRST_QUEUE_WORKERS = [
  "crawler",
  "lowPriorityCrawler",
  "inference",
  "search",
  "feed",
  "ruleEngine",
  "webhook",
  "backup",
  "assetPreprocessing",
  "transcript",
  "embeddingCleanup",
] as const;

export const SCREENSHOT_FIRST_IMPORT_WORKER = "import" as const;
