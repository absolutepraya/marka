import crypto from "node:crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { and, eq } from "drizzle-orm";
import { execa } from "execa";
import { workerStatsCounter } from "metrics";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fromBuffer } from "pdf2pic";
import { createWorker } from "tesseract.js";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";

import type { AssetPreprocessingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarks,
} from "@karakeep/db/schema";
import {
  addLogFields,
  AssetPreprocessingQueue,
  EmbeddingsQueue,
  OpenAIQueue,
  QuotaService,
  StorageQuotaError,
  triggerSearchReindex,
} from "@karakeep/shared-server";
import {
  newAssetId,
  readAsset,
  saveAsset,
  silentDeleteAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import {
  formatPdfPageText,
  samplePdfText,
  selectRepresentativePageNumbers,
} from "@karakeep/shared/pdf";
import { buildOCRPrompt } from "@karakeep/shared/prompts";
import {
  DequeuedJob,
  EnqueueOptions,
  getQueueClient,
} from "@karakeep/shared/queueing";

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

export class AssetPreprocessingWorker {
  static async build() {
    logger.info("Starting asset preprocessing worker ...");
    const worker =
      (await getQueueClient())!.createRunner<AssetPreprocessingRequest>(
        AssetPreprocessingQueue,
        {
          run: withWorkerTracing(
            "assetPreprocessingWorker.run",
            withWorkerEventLog("assetPreprocessingWorker.run", run),
          ),
          onComplete: async (job) => {
            workerStatsCounter.labels("assetPreprocessing", "completed").inc();
            const jobId = job.id;
            logger.info(
              `[assetPreprocessing][${jobId}] Completed successfully`,
            );
            return Promise.resolve();
          },
          onError: async (job) => {
            workerStatsCounter.labels("assetPreProcessing", "failed").inc();
            if (job.numRetriesLeft == 0) {
              workerStatsCounter
                .labels("assetPreProcessing", "failed_permanent")
                .inc();
            }
            const jobId = job.id;
            logger.error(
              `[assetPreprocessing][${jobId}] Asset preprocessing failed: ${job.error}\n${job.error.stack}`,
            );

            const bookmarkId = job.data?.bookmarkId;
            if (bookmarkId && job.numRetriesLeft == 0) {
              await db.transaction(async (tx) => {
                await tx
                  .update(bookmarks)
                  .set({
                    taggingStatus: null,
                  })
                  .where(
                    and(
                      eq(bookmarks.id, bookmarkId),
                      eq(bookmarks.taggingStatus, "pending"),
                    ),
                  );
                await tx
                  .update(bookmarks)
                  .set({
                    summarizationStatus: null,
                  })
                  .where(
                    and(
                      eq(bookmarks.id, bookmarkId),
                      eq(bookmarks.summarizationStatus, "pending"),
                    ),
                  );
                await tx
                  .update(bookmarks)
                  .set({
                    embeddingStatus: null,
                  })
                  .where(
                    and(
                      eq(bookmarks.id, bookmarkId),
                      eq(bookmarks.embeddingStatus, "pending"),
                    ),
                  );
              });
            }
            return Promise.resolve();
          },
        },
        {
          concurrency: serverConfig.assetPreprocessing.numWorkers,
          pollIntervalMs: 1000,
          timeoutSecs: serverConfig.assetPreprocessing.jobTimeoutSec,
        },
      );

    return worker;
  }
}

async function recognizeImageText(worker: TesseractWorker, buffer: Buffer) {
  const ret = await worker.recognize(buffer);
  if (ret.data.confidence <= serverConfig.ocr.confidenceThreshold) {
    return null;
  }
  return ret.data.text;
}

async function readImageText(buffer: Buffer) {
  if (serverConfig.ocr.langs.length == 1 && serverConfig.ocr.langs[0] == "") {
    return null;
  }
  const worker = await createWorker(serverConfig.ocr.langs, undefined, {
    cachePath: serverConfig.ocr.cacheDir ?? os.tmpdir(),
  });
  try {
    return await recognizeImageText(worker, buffer);
  } finally {
    await worker.terminate();
  }
}

async function readImageTextWithLLM(
  buffer: Buffer,
  contentType: string,
): Promise<string | null> {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.warn(
      "[assetPreprocessing] LLM OCR is enabled but no inference client is configured. Falling back to Tesseract.",
    );
    return readImageText(buffer);
  }

  const base64 = buffer.toString("base64");
  const prompt = buildOCRPrompt();

  const response = await inferenceClient.inferFromImage(
    prompt,
    contentType,
    base64,
    {
      schema: null,
      imageDetail: "high",
    },
  );

  const extractedText = response.response.trim();
  if (!extractedText) {
    logger.info(
      "[assetPreprocessing] LLM OCR returned no text. Falling back to Tesseract.",
    );
    return readImageText(buffer);
  }

  return extractedText;
}

async function readPDFText(buffer: Buffer): Promise<{
  text: string;
  pageTexts: Map<number, string>;
  metadata: Record<string, unknown>;
  pageCount: number;
}> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  const pageTexts = new Map<number, string>();

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";

      for (const item of textContent.items) {
        if (!("str" in item)) {
          continue;
        }
        currentLine += item.str;
        if (item.hasEOL) {
          lines.push(currentLine);
          currentLine = "";
        } else if (currentLine.length > 0) {
          currentLine += " ";
        }
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }

      const text = lines.join("\n").trim();
      if (text) {
        pageTexts.set(pageNumber, text);
      }
    }

    let metadata: Record<string, unknown> = {};
    try {
      const metadataResult = await document.getMetadata();
      if (metadataResult.info && typeof metadataResult.info === "object") {
        metadata = { ...(metadataResult.info as Record<string, unknown>) };
      }
    } catch {
      // PDF metadata is optional and should not block text extraction.
    }

    return {
      text: formatPdfPageText(
        [...pageTexts].map(([pageNumber, text]) => ({ pageNumber, text })),
      ),
      pageTexts,
      metadata,
      pageCount: document.numPages,
    };
  } finally {
    await document.destroy();
  }
}

async function readPDFTextWithOCR(
  buffer: Buffer,
  pageCount: number,
): Promise<Map<number, string> | null> {
  if (serverConfig.ocr.langs.length == 1 && serverConfig.ocr.langs[0] == "") {
    return null;
  }

  const pagesToRead = Math.min(pageCount, serverConfig.ocr.pdfMaxPages);
  if (pagesToRead === 0) {
    return null;
  }

  const convertPage = fromBuffer(buffer, {
    density: 150,
    format: "png",
    preserveAspectRatio: true,
  });
  const worker = await createWorker(serverConfig.ocr.langs, undefined, {
    cachePath: serverConfig.ocr.cacheDir ?? os.tmpdir(),
  });
  const pageTexts = new Map<number, string>();

  try {
    for (let page = 1; page <= pagesToRead; page += 1) {
      const rendered = await convertPage(page, { responseType: "buffer" });
      if (!rendered.buffer) {
        continue;
      }
      const text = await recognizeImageText(worker, rendered.buffer);
      if (text?.trim()) {
        pageTexts.set(page, text.trim());
      }
    }
  } finally {
    await worker.terminate();
  }

  return pageTexts.size > 0 ? pageTexts : null;
}

async function readPDFTextWithLLM(
  buffer: Buffer,
  pageNumbers: number[],
): Promise<Map<number, string> | null> {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient || pageNumbers.length === 0) {
    return null;
  }

  const convertPage = fromBuffer(buffer, {
    density: 150,
    format: "png",
    preserveAspectRatio: true,
  });
  const pageTexts = new Map<number, string>();

  for (const page of pageNumbers) {
    try {
      const rendered = await convertPage(page, { responseType: "buffer" });
      if (!rendered.buffer) {
        continue;
      }
      const response = await inferenceClient.inferFromImage(
        buildOCRPrompt(),
        "image/png",
        rendered.buffer.toString("base64"),
        { schema: null, imageDetail: "high" },
      );
      const text = response.response.trim();
      if (text) {
        pageTexts.set(page, text);
      }
    } catch (error) {
      logger.warn(
        `[assetPreprocessing] Failed to extract LLM OCR text from PDF page ${page}: ${error}`,
      );
    }
  }

  return pageTexts.size > 0 ? pageTexts : null;
}

export async function extractAndSavePDFScreenshot(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
  force: boolean,
): Promise<boolean> {
  const existingScreenshot = bookmark.assets.find(
    (r) => r.assetType === AssetTypes.ASSET_SCREENSHOT,
  );
  if (existingScreenshot && !(isFixMode && force)) {
    logger.info(
      `[assetPreprocessing][${jobId}] Skipping PDF screenshot generation as it's already been generated.`,
    );
    return false;
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to generate PDF screenshot for bookmarkId: ${bookmark.id}`,
  );
  let replacementAssetId: string | undefined;
  try {
    /**
     * If you encountered any issues with this library, make sure you have ghostscript and graphicsmagick installed following this URL
     * https://github.com/yakovmeister/pdf2image/blob/HEAD/docs/gm-installation.md
     */
    const screenshot = await fromBuffer(asset, {
      density: 100,
      quality: 100,
      format: "png",
      preserveAspectRatio: true,
    })(1, { responseType: "buffer" });

    const screenshotBuffer = screenshot.buffer;
    if (!screenshotBuffer) {
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to generate PDF screenshot`,
      );
      return false;
    }

    // Check storage quota before inserting
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      bookmark.userId,
      screenshotBuffer.byteLength,
    );

    // Store the screenshot
    const assetId = newAssetId();
    replacementAssetId = assetId;
    const fileName = "screenshot.png";
    const contentType = "image/png";
    await saveAsset({
      userId: bookmark.userId,
      assetId,
      asset: screenshotBuffer,
      metadata: {
        contentType,
        fileName,
      },
      quotaApproved,
    });

    // Replace the old row atomically after the new object is safely stored.
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        id: assetId,
        bookmarkId: bookmark.id,
        userId: bookmark.userId,
        assetType: AssetTypes.ASSET_SCREENSHOT,
        contentType,
        size: screenshotBuffer.byteLength,
        fileName,
      });
      if (existingScreenshot) {
        await tx.delete(assets).where(eq(assets.id, existingScreenshot.id));
      }
    });

    if (existingScreenshot) {
      await silentDeleteAsset(bookmark.userId, existingScreenshot.id);
    }

    logger.info(
      `[assetPreprocessing][${jobId}] Successfully saved PDF screenshot to database`,
    );
    return true;
  } catch (error) {
    if (replacementAssetId) {
      await silentDeleteAsset(bookmark.userId, replacementAssetId);
    }
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[assetPreprocessing][${jobId}] Skipping PDF screenshot due to quota exceeded: ${error.message}`,
      );
      return true; // Return true to indicate the job completed successfully, just skipped the asset
    }
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to process PDF screenshot: ${error}`,
    );
    return false;
  }
}

async function extractAndSaveVideoScreenshot(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  abortSignal: AbortSignal,
): Promise<boolean> {
  const alreadyHasScreenshot =
    bookmark.assets.find((r) => r.assetType === AssetTypes.ASSET_SCREENSHOT) !==
    undefined;
  if (alreadyHasScreenshot) {
    logger.info(
      `[assetPreprocessing][${jobId}] Skipping video screenshot generation as it's already been generated.`,
    );
    return false;
  }

  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to generate video first-frame screenshot for bookmarkId: ${bookmark.id}`,
  );

  let tempDir: string | undefined;
  try {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "video-screenshot-"),
    );
    const videoPath = path.join(tempDir, "video");
    const screenshotPath = path.join(tempDir, "screenshot.jpg");

    await fs.promises.writeFile(videoPath, asset);
    await execa(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        videoPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-f",
        "image2",
        screenshotPath,
      ],
      { cancelSignal: abortSignal },
    );

    const screenshot = await fs.promises.readFile(screenshotPath);

    // Check storage quota before inserting
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      bookmark.userId,
      screenshot.byteLength,
    );

    const assetId = newAssetId();
    const fileName = "screenshot.jpg";
    const contentType = "image/jpeg";
    await saveAsset({
      userId: bookmark.userId,
      assetId,
      asset: screenshot,
      metadata: {
        contentType,
        fileName,
      },
      quotaApproved,
    });

    await db.insert(assets).values({
      id: assetId,
      bookmarkId: bookmark.id,
      userId: bookmark.userId,
      assetType: AssetTypes.ASSET_SCREENSHOT,
      contentType,
      size: screenshot.byteLength,
      fileName,
    });

    logger.info(
      `[assetPreprocessing][${jobId}] Successfully saved video first-frame screenshot to database`,
    );
    return true;
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[assetPreprocessing][${jobId}] Skipping video screenshot due to quota exceeded: ${error.message}`,
      );
      return true;
    }
    logger.error(
      `[assetPreprocessing][${jobId}] Failed to process video screenshot: ${error}`,
    );
    return false;
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function extractAndSaveImageText(
  jobId: string,
  asset: Buffer,
  contentType: string,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
): Promise<boolean> {
  {
    const alreadyHasText = !!bookmark.asset.content;
    if (alreadyHasText && isFixMode) {
      logger.info(
        `[assetPreprocessing][${jobId}] Skipping image text extraction as it's already been extracted.`,
      );
      return false;
    }
  }
  let imageText = null;

  if (serverConfig.ocr.useLLM) {
    logger.info(
      `[assetPreprocessing][${jobId}] Attempting to extract text from image using LLM OCR.`,
    );
    try {
      imageText = await readImageTextWithLLM(asset, contentType);
    } catch (e) {
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to read image text with LLM: ${e}`,
      );
      try {
        imageText = await readImageText(asset);
      } catch (fallbackError) {
        logger.error(
          `[assetPreprocessing][${jobId}] Failed to read image text with Tesseract fallback: ${fallbackError}`,
        );
      }
    }
  } else {
    logger.info(
      `[assetPreprocessing][${jobId}] Attempting to extract text from image using Tesseract.`,
    );
    try {
      imageText = await readImageText(asset);
    } catch (e) {
      logger.error(
        `[assetPreprocessing][${jobId}] Failed to read image text: ${e}`,
      );
    }
  }

  if (!imageText) {
    return false;
  }

  logger.info(
    `[assetPreprocessing][${jobId}] Extracted ${imageText.length} characters from image.`,
  );
  await db
    .update(bookmarkAssets)
    .set({
      content: imageText,
      metadata: null,
    })
    .where(eq(bookmarkAssets.id, bookmark.id));
  return true;
}

async function extractAndSavePDFText(
  jobId: string,
  asset: Buffer,
  bookmark: NonNullable<Awaited<ReturnType<typeof getBookmark>>>,
  isFixMode: boolean,
  force: boolean,
): Promise<boolean> {
  {
    const alreadyHasText = !!bookmark.asset.content;
    if (alreadyHasText && isFixMode && !force) {
      logger.info(
        `[assetPreprocessing][${jobId}] Skipping PDF text extraction as it's already been extracted.`,
      );
      return false;
    }
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Attempting to extract text from pdf.`,
  );
  const pdfParse = await readPDFText(asset);
  const pageTexts = new Map(pdfParse.pageTexts);
  const aiSamplePages = selectRepresentativePageNumbers(pdfParse.pageCount);
  let textSource = "embedded";
  const localOcrPages: number[] = [];
  const aiOcrPages: number[] = [];

  let extractedText = pdfParse.text.trim();
  if (!extractedText) {
    textSource = "ocr";
    logger.info(
      `[assetPreprocessing][${jobId}] PDF has no embedded text. Attempting local OCR on up to ${serverConfig.ocr.pdfMaxPages} pages.`,
    );
    const localOcrText = await readPDFTextWithOCR(asset, pdfParse.pageCount);
    for (const [page, text] of localOcrText ?? []) {
      pageTexts.set(page, text);
      localOcrPages.push(page);
    }

    if (serverConfig.ocr.useLLM) {
      const aiOcrText = await readPDFTextWithLLM(
        asset,
        selectRepresentativePageNumbers(pdfParse.pageCount),
      );
      for (const [page, text] of aiOcrText ?? []) {
        pageTexts.set(page, text);
        aiOcrPages.push(page);
      }
    }

    extractedText = formatPdfPageText(
      [...pageTexts].map(([pageNumber, text]) => ({ pageNumber, text })),
    ).trim();
  }
  if (!extractedText) {
    throw new Error(
      `[assetPreprocessing][${jobId}] PDF text extraction and local OCR returned no text.`,
    );
  }
  logger.info(
    `[assetPreprocessing][${jobId}] Extracted ${extractedText.length} characters from pdf.`,
  );
  await db
    .update(bookmarkAssets)
    .set({
      content: extractedText,
      metadata: JSON.stringify({
        ...pdfParse.metadata,
        marka: {
          pageCount: pdfParse.pageCount,
          textSource,
          localOcrPages,
          aiOcrPages,
          aiSamplePages,
          aiSampleFingerprint: crypto
            .createHash("sha256")
            .update(samplePdfText(extractedText, pdfParse.pageCount))
            .digest("hex"),
        },
      }),
    })
    .where(eq(bookmarkAssets.id, bookmark.id));
  return true;
}

async function getBookmark(bookmarkId: string) {
  return db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
      assets: true,
    },
  });
}

async function run(req: DequeuedJob<AssetPreprocessingRequest>) {
  const isFixMode = req.data.fixMode;
  const force = req.data.force ?? false;
  const jobId = req.id;
  const bookmarkId = req.data.bookmarkId;
  addLogFields<"assetPreprocessingWorker.run">({ "bookmark.id": bookmarkId });

  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      asset: true,
      assets: true,
    },
  });

  logger.info(
    `[assetPreprocessing][${jobId}] Starting an asset preprocessing job for bookmark with id "${bookmarkId}"`,
  );

  if (!bookmark) {
    throw new Error(`[assetPreprocessing][${jobId}] Bookmark not found`);
  }

  if (!bookmark.asset) {
    throw new Error(
      `[assetPreprocessing][${jobId}] Bookmark is not an asset (not an image, pdf, or video)`,
    );
  }

  const { asset, metadata } = await readAsset({
    userId: bookmark.userId,
    assetId: bookmark.asset.assetId,
  });

  if (!asset) {
    throw new Error(
      `[assetPreprocessing][${jobId}] AssetId ${bookmark.asset.assetId} for bookmark ${bookmarkId} not found`,
    );
  }

  addLogFields<"assetPreprocessingWorker.run">({
    "user.id": bookmark.userId,
    "asset.type": bookmark.asset.assetType,
    "asset.size": asset.length,
    "asset.content_type": metadata.contentType,
    "preprocessing.fix_mode": isFixMode,
  });

  let anythingChanged = false;
  switch (bookmark.asset.assetType) {
    case "image": {
      const extractedText = await extractAndSaveImageText(
        jobId,
        asset,
        metadata.contentType,
        bookmark,
        isFixMode,
      );
      anythingChanged ||= extractedText;
      break;
    }
    case "pdf": {
      const extractedScreenshot = await extractAndSavePDFScreenshot(
        jobId,
        asset,
        bookmark,
        isFixMode,
        force,
      );
      const extractedText = await extractAndSavePDFText(
        jobId,
        asset,
        bookmark,
        isFixMode,
        force,
      );
      anythingChanged ||= extractedText || extractedScreenshot;
      break;
    }
    case "video": {
      const extractedScreenshot = await extractAndSaveVideoScreenshot(
        jobId,
        asset,
        bookmark,
        req.abortSignal,
      );
      anythingChanged ||= extractedScreenshot;
      break;
    }
    case "audio":
      // Audio is transcribed by TranscriptWorker after the original asset is
      // available. There is no preprocessing step required here.
      break;
    default:
      throw new Error(
        `[assetPreprocessing][${jobId}] Unsupported bookmark type`,
      );
  }

  addLogFields<"assetPreprocessingWorker.run">({
    "preprocessing.changed": anythingChanged,
  });

  // Propagate priority to child jobs
  const enqueueOpts: EnqueueOptions = {
    priority: req.priority,
    groupId: bookmark.userId,
  };
  const isTranscribedMedia =
    (bookmark.asset.assetType === "video" ||
      bookmark.asset.assetType === "audio") &&
    serverConfig.transcription.enabled;
  if ((!isFixMode || anythingChanged) && !isTranscribedMedia) {
    if (serverConfig.embedding.enableAutoIndexing) {
      await EmbeddingsQueue.enqueue(
        {
          bookmarkId,
          type: "embed",
          runTaggingOnComplete: true,
        },
        enqueueOpts,
      );
    } else {
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "tag",
        },
        enqueueOpts,
      );
    }
    if (serverConfig.inference.enableAutoSummarization) {
      await OpenAIQueue.enqueue(
        {
          bookmarkId,
          type: "summarize",
        },
        enqueueOpts,
      );
    } else {
      await db
        .update(bookmarks)
        .set({ summarizationStatus: null })
        .where(
          and(
            eq(bookmarks.id, bookmarkId),
            eq(bookmarks.summarizationStatus, "pending"),
          ),
        );
    }
  }

  if (!isFixMode || anythingChanged) {
    // Update the search index even when media enrichment is deferred to the
    // transcript worker or transcription later fails.
    await triggerSearchReindex(bookmarkId, enqueueOpts);
  }
}
