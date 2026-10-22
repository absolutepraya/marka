import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// On the Cloudflare target these jobs run in Containers against the remote
// library store, which cannot hold a transaction open across requests
// (ADR 0011). Atomic work belongs in a persist function under ./persist.
const CONTAINER_JOBS = [
  "workers/crawlerWorker.ts",
  "workers/videoWorker.ts",
  "workers/transcriptWorker.ts",
  "workers/mediaTranscription.ts",
  "workers/assetPreprocessingWorker.ts",
];

describe("container jobs", () => {
  it.each(CONTAINER_JOBS)("%s opens no transactions", (file) => {
    const source = readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(source).not.toMatch(/\.transaction\(/);
  });
});
