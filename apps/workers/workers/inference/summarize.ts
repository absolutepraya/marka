import { and, eq } from "drizzle-orm";
import { getBookmarkDomain } from "network";

import { db } from "@karakeep/db";
import {
  bookmarkTranscripts,
  bookmarks,
  customPrompts,
  users,
} from "@karakeep/db/schema";
import {
  addLogFields,
  setSpanAttributes,
  triggerSearchReindex,
  ZOpenAIRequest,
} from "@karakeep/shared-server";
import { readAsset } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { InferenceClient } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { getPdfPageCount, samplePdfText } from "@karakeep/shared/pdf";
import { buildSummaryPrompt } from "@karakeep/shared/prompts.server";
import {
  buildImageSummaryPrompt,
  normalizeSummary,
} from "@karakeep/shared/prompts";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

async function fetchBookmarkDetailsForSummary(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: {
      id: true,
      userId: true,
      title: true,
      type: true,
      summaryProvenance: true,
    },
    with: {
      link: {
        columns: {
          title: true,
          description: true,
          htmlContent: true,
          contentAssetId: true,
          crawlStatusCode: true,
          publisher: true,
          author: true,
          url: true,
        },
      },
      transcript: {
        columns: {
          status: true,
          revision: true,
          sourceLanguage: true,
          text: true,
        },
      },
      text: {
        columns: {
          text: true,
          sourceUrl: true,
          format: true,
        },
      },
      asset: {
        columns: {
          assetType: true,
          assetId: true,
          content: true,
          metadata: true,
          fileName: true,
          sourceUrl: true,
        },
      },
    },
  });

  if (!bookmark) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }
  return bookmark;
}

export async function runSummarization(
  bookmarkId: string,
  job: DequeuedJob<ZOpenAIRequest>,
  inferenceClient: InferenceClient,
): Promise<boolean> {
  if (!serverConfig.inference.enableAutoSummarization) {
    logger.debug(
      `[inference][${job.id}] Skipping summarization job for bookmark with id "${bookmarkId}" because it's disabled in the config.`,
    );
    return false;
  }
  const jobId = job.id;

  logger.info(
    `[inference][${jobId}] Starting a summary job for bookmark with id "${bookmarkId}"`,
  );

  const bookmarkData = await fetchBookmarkDetailsForSummary(bookmarkId);
  const summarySource = job.data.summarySource ?? "web";

  if (bookmarkData.summaryProvenance === "manual") {
    logger.info(
      `[inference][${jobId}] Skipping summary for bookmark ${bookmarkId} because the summary is user-owned.`,
    );
    return false;
  }
  if (
    summarySource === "transcript" &&
    job.data.transcriptRevision !== undefined &&
    bookmarkData.transcript?.revision !== job.data.transcriptRevision
  ) {
    logger.info(
      `[inference][${jobId}] Skipping stale transcript summary job for bookmark ${bookmarkId}.`,
    );
    return false;
  }

  // Check user-level preference
  const userSettings = await db.query.users.findFirst({
    where: eq(users.id, bookmarkData.userId),
    columns: {
      autoSummarizationEnabled: true,
      inferredTagLang: true,
      summaryLanguage: true,
    },
  });

  setSpanAttributes({
    "user.id": bookmarkData.userId,
    "bookmark.id": bookmarkData.id,
    "inference.type": "summarization",
  });
  let imageToSummarize: {
    contentType: string;
    base64: string;
  } | null = null;

  addLogFields<"inferenceWorker.run">({
    "user.id": bookmarkData.userId,
    "bookmark.url": bookmarkData.link?.url,
    "bookmark.domain": getBookmarkDomain(bookmarkData.link?.url),
    "bookmark.content_type": bookmarkData.type,
    "crawler.status_code": bookmarkData.link?.crawlStatusCode ?? undefined,
  });

  if (userSettings?.autoSummarizationEnabled === false) {
    logger.debug(
      `[inference][${jobId}] Skipping summarization job for bookmark with id "${bookmarkId}" because user has disabled auto-summarization.`,
    );
    return false;
  }

  let textToSummarize = "";
  if (summarySource === "transcript") {
    if (
      bookmarkData.transcript?.status !== "ready" ||
      !bookmarkData.transcript.text?.trim()
    ) {
      logger.info(
        `[inference][${jobId}] Transcript is not ready for bookmark ${bookmarkId}. Skipping summary.`,
      );
      return false;
    }

    const link = bookmarkData.link;
    const asset = bookmarkData.asset;
    textToSummarize = `
Title: ${link?.title ?? asset?.fileName ?? ""}
Description: ${link?.description ?? ""}
Transcript${bookmarkData.transcript.sourceLanguage ? ` (${bookmarkData.transcript.sourceLanguage})` : ""}: ${bookmarkData.transcript.text}
Publisher: ${link?.publisher ?? ""}
Author: ${link?.author ?? ""}
URL: ${link?.url ?? asset?.sourceUrl ?? ""}
`;
  } else if (bookmarkData.type === BookmarkTypes.LINK && bookmarkData.link) {
    const link = bookmarkData.link;
    const content =
      (await Bookmark.getBookmarkPlainTextContent(link, bookmarkData.userId)) ??
      "";

    if (!link.description && !content) {
      logger.info(
        `[inference] No content found for link "${bookmarkId}". Skipping summary.`,
      );
      return false;
    }

    textToSummarize = `
Title: ${link.title ?? ""}
Description: ${link.description ?? ""}
Content: ${content}
Publisher: ${link.publisher ?? ""}
Author: ${link.author ?? ""}
URL: ${link.url ?? ""}
`;
  } else if (bookmarkData.type === BookmarkTypes.TEXT && bookmarkData.text) {
    const content = bookmarkData.text.text?.trim() ?? "";
    if (!content) {
      logger.info(
        `[inference][${jobId}] No content found for text bookmark "${bookmarkId}". Skipping summary.`,
      );
      return false;
    }

    textToSummarize = `
Title: ${bookmarkData.title ?? ""}
Format: ${bookmarkData.text.format}
Source URL: ${bookmarkData.text.sourceUrl ?? ""}
Content: ${content}
`;
  } else if (bookmarkData.type === BookmarkTypes.ASSET && bookmarkData.asset) {
    const asset = bookmarkData.asset;
    const content = asset.content?.trim() ?? "";
    if (asset.assetType === "image" && !content) {
      const { asset: image, metadata } = await readAsset({
        userId: bookmarkData.userId,
        assetId: asset.assetId,
      });
      if (metadata.contentType === "image/gif") {
        logger.info(
          `[inference][${jobId}] GIF bookmark "${bookmarkId}" has no OCR text. Skipping summary.`,
        );
        return false;
      }
      imageToSummarize = {
        contentType: metadata.contentType,
        base64: image.toString("base64"),
      };
      textToSummarize = `
Title: ${bookmarkData.title ?? asset.fileName ?? ""}
File name: ${asset.fileName ?? ""}
`;
    } else if (asset.assetType === "image" || asset.assetType === "pdf") {
      const inferenceContent =
        asset.assetType === "pdf"
          ? samplePdfText(content, getPdfPageCount(asset.metadata))
          : content;
      if (!inferenceContent) {
        logger.info(
          `[inference][${jobId}] No extracted content found for asset bookmark "${bookmarkId}". Skipping summary.`,
        );
        return false;
      }
      textToSummarize = `
Title: ${bookmarkData.title ?? asset.fileName ?? ""}
File name: ${asset.fileName ?? ""}
Content: ${inferenceContent}
`;
    } else {
      logger.info(
        `[inference][${jobId}] Asset bookmark "${bookmarkId}" has no ready transcript or summarizable text. Skipping summary.`,
      );
      return false;
    }
  } else {
    logger.warn(
      `[inference][${jobId}] Bookmark ${bookmarkId} (type: ${bookmarkData.type}) has no supported summary source. Skipping summary.`,
    );
    return false;
  }

  if (!imageToSummarize && !textToSummarize.trim()) {
    logger.info(
      `[inference][${jobId}] No content to summarize for bookmark ${bookmarkId}.`,
    );
    return false;
  }

  const prompts = await db.query.customPrompts.findMany({
    where: and(
      eq(customPrompts.userId, bookmarkData.userId),
      eq(customPrompts.appliesTo, "summary"),
    ),
    columns: {
      text: true,
    },
  });

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.custom_count": prompts.length,
  });

  const summaryLanguage =
    userSettings?.summaryLanguage ??
    userSettings?.inferredTagLang ??
    serverConfig.inference.inferredTagLang;
  const summaryPrompt = imageToSummarize
    ? buildImageSummaryPrompt(
        summaryLanguage,
        prompts.map((p) => p.text),
      )
    : await buildSummaryPrompt(
        summaryLanguage,
        prompts.map((p) => p.text),
        textToSummarize,
        serverConfig.inference.contextLength,
      );

  addLogFields<"inferenceWorker.run">({
    "inference.model": imageToSummarize
      ? serverConfig.inference.imageModel
      : serverConfig.inference.textModel,
    "inference.prompt.size": Buffer.byteLength(summaryPrompt, "utf8"),
  });

  const summaryResult = imageToSummarize
    ? await inferenceClient.inferFromImage(
        summaryPrompt,
        imageToSummarize.contentType,
        imageToSummarize.base64,
        {
          schema: null,
          abortSignal: job.abortSignal,
          imageDetail: "low",
        },
      )
    : await inferenceClient.inferFromText(summaryPrompt, {
        schema: null, // Summaries are typically free-form text
        abortSignal: job.abortSignal,
      });

  if (!summaryResult.response) {
    throw new Error(
      `[inference][${jobId}] Failed to summarize bookmark ${bookmarkId}, empty response from inference client.`,
    );
  }

  const summary = normalizeSummary(summaryResult.response);

  addLogFields<"inferenceWorker.run">({
    "inference.summary.size": Buffer.byteLength(summary, "utf8"),
    "inference.total_tokens": summaryResult.totalTokens,
  });

  logger.info(
    `[inference][${jobId}] Generated summary for bookmark "${bookmarkId}" using ${summaryResult.totalTokens} tokens.`,
  );

  if (
    summarySource === "transcript" &&
    job.data.transcriptRevision !== undefined
  ) {
    const currentBookmark = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
      columns: { summaryProvenance: true },
    });
    const currentTranscript = await db.query.bookmarkTranscripts.findFirst({
      where: eq(bookmarkTranscripts.bookmarkId, bookmarkId),
      columns: { revision: true, status: true },
    });
    if (
      currentBookmark?.summaryProvenance === "manual" ||
      currentTranscript?.status !== "ready" ||
      currentTranscript.revision !== job.data.transcriptRevision
    ) {
      logger.info(
        `[inference][${jobId}] Discarding stale transcript summary result for bookmark ${bookmarkId}.`,
      );
      return false;
    }
  }

  await db
    .update(bookmarks)
    .set({
      summary,
      summaryProvenance: summarySource,
      summaryStale: false,
      modifiedAt: new Date(),
    })
    .where(eq(bookmarks.id, bookmarkId));

  await triggerSearchReindex(bookmarkId, {
    priority: job.priority,
    groupId: bookmarkData.userId,
  });

  return true;
}
