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
import serverConfig from "@karakeep/shared/config";
import { InferenceClient } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { buildSummaryPrompt } from "@karakeep/shared/prompts.server";
import { normalizeSummary } from "@karakeep/shared/prompts";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

async function fetchBookmarkDetailsForSummary(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: {
      id: true,
      userId: true,
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
      asset: {
        columns: {
          assetType: true,
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
  addLogFields<"inferenceWorker.run">({
    "user.id": bookmarkData.userId,
    "bookmark.url": bookmarkData.link?.url,
    "bookmark.domain": getBookmarkDomain(bookmarkData.link?.url),
    "bookmark.content_type": bookmarkData.type,
    "crawler.status_code": bookmarkData.link?.crawlStatusCode ?? undefined,
    "inference.model": serverConfig.inference.textModel,
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
  } else {
    logger.warn(
      `[inference][${jobId}] Bookmark ${bookmarkId} (type: ${bookmarkData.type}) is not a LINK or TEXT type with content, or content is missing. Skipping summary.`,
    );
    return false;
  }

  if (!textToSummarize.trim()) {
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

  const summaryPrompt = await buildSummaryPrompt(
    userSettings?.summaryLanguage ??
      userSettings?.inferredTagLang ??
      serverConfig.inference.inferredTagLang,
    prompts.map((p) => p.text),
    textToSummarize,
    serverConfig.inference.contextLength,
  );

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.size": Buffer.byteLength(summaryPrompt, "utf8"),
  });

  const summaryResult = await inferenceClient.inferFromText(summaryPrompt, {
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
