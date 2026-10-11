import { describe, expect, it } from "vitest";

import {
  SCREENSHOT_FIRST_IMPORT_WORKER,
  SCREENSHOT_FIRST_QUEUE_WORKERS,
} from "./workerProfiles";

describe("screenshot-first worker profile", () => {
  it("starts exactly the approved workers", () => {
    expect(SCREENSHOT_FIRST_QUEUE_WORKERS).toEqual([
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
    ]);
    expect(SCREENSHOT_FIRST_QUEUE_WORKERS).not.toContain("embeddings");
    expect(SCREENSHOT_FIRST_QUEUE_WORKERS).not.toContain("video");
    expect(SCREENSHOT_FIRST_QUEUE_WORKERS).not.toContain("adminMaintenance");
    expect(SCREENSHOT_FIRST_IMPORT_WORKER).toBe("import");
  });
});
