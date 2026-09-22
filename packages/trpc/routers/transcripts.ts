import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  AssetTypes,
  bookmarkTranscripts,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import {
  OpenAIQueue,
  QueuePriority,
  SearchIndexingQueue,
  TranscriptQueue,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { EnqueueOptions } from "@karakeep/shared/queueing";
import {
  zResetTranscriptRequestSchema,
  zRetryTranscriptRequestSchema,
  zTranscriptResponseSchema,
  zUpdateTranscriptRequestSchema,
} from "@karakeep/shared/types/transcripts";
import { getYouTubeVideoId } from "@karakeep/shared/youtube";

import type { AuthedContext } from "../index";
import {
  createRateLimitMiddleware,
  createScopedAuthedProcedure,
  router,
} from "../index";
import { ensureBookmarkAccess, ensureBookmarkOwnership } from "./bookmarks";

const transcriptsProcedure = createScopedAuthedProcedure("bookmarks");

async function getTranscript(ctx: AuthedContext, bookmarkId: string) {
  return await ctx.db.query.bookmarkTranscripts.findFirst({
    where: eq(bookmarkTranscripts.bookmarkId, bookmarkId),
    with: { assets: true },
  });
}

function serializeTranscript(
  transcript: NonNullable<Awaited<ReturnType<typeof getTranscript>>>,
) {
  const { assets: sourceAttachments, ...data } = transcript;
  return {
    ...data,
    sourceAttachments: sourceAttachments
      .filter((asset) => asset.assetType === AssetTypes.CAPTION_SOURCE)
      .map((asset) => ({
        id: asset.id,
        assetType: "captionSource" as const,
        fileName: asset.fileName,
      })),
  };
}

async function getSummarySettings(ctx: {
  db: AuthedContext["db"];
  user: { id: string };
}) {
  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, ctx.user.id),
    columns: { autoSummarizationEnabled: true },
  });
  return {
    enabled:
      serverConfig.inference.enableAutoSummarization &&
      user?.autoSummarizationEnabled !== false,
  };
}

async function enqueueTranscriptSummary(
  bookmarkId: string,
  userId: string,
  priority = QueuePriority.Default,
  transcriptRevision?: number,
) {
  const options: EnqueueOptions = { groupId: userId, priority };
  await OpenAIQueue.enqueue(
    {
      bookmarkId,
      type: "summarize",
      summarySource: "transcript",
      transcriptRevision,
    },
    options,
  );
}

async function enqueueSearchIndex(bookmarkId: string, userId: string) {
  await SearchIndexingQueue.enqueue(
    { bookmarkId, type: "index" },
    { groupId: userId, priority: QueuePriority.Default },
  );
}

export const transcriptsAppRouter = router({
  get: transcriptsProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(zTranscriptResponseSchema.nullable())
    .use(ensureBookmarkAccess)
    .query(async ({ input, ctx }) => {
      const transcript = await getTranscript(ctx, input.bookmarkId);
      return transcript ? serializeTranscript(transcript) : null;
    }),

  update: transcriptsProcedure
    .input(zUpdateTranscriptRequestSchema)
    .output(zTranscriptResponseSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const transcript = await getTranscript(ctx, input.bookmarkId);
      if (!transcript) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transcript not found",
        });
      }
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== transcript.revision
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Transcript changed since it was loaded",
        });
      }

      const textChanged = input.text !== (transcript.text ?? "");
      const nextRevision = transcript.revision + (textChanged ? 1 : 0);
      const summarySettings = await getSummarySettings(ctx);
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, input.bookmarkId),
        columns: { summaryProvenance: true },
      });
      const summaryIsManual = bookmark?.summaryProvenance === "manual";

      await ctx.db.transaction(async (tx) => {
        const result = await tx
          .update(bookmarkTranscripts)
          .set({
            text: input.text,
            manualOverride: true,
            revision: nextRevision,
            modifiedAt: new Date(),
          })
          .where(
            and(
              eq(bookmarkTranscripts.id, transcript.id),
              eq(bookmarkTranscripts.revision, transcript.revision),
            ),
          );

        if (result.changes === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Transcript changed since it was loaded",
          });
        }

        if (!textChanged) return;

        await tx
          .update(bookmarks)
          .set({
            ...(summaryIsManual
              ? {}
              : {
                  summaryProvenance: "transcript",
                  summaryStale: true,
                  ...(summarySettings.enabled
                    ? { summarizationStatus: "pending" as const }
                    : {}),
                }),
            modifiedAt: new Date(),
          })
          .where(eq(bookmarks.id, input.bookmarkId));
      });

      if (textChanged && !summaryIsManual && summarySettings.enabled) {
        await enqueueTranscriptSummary(
          input.bookmarkId,
          ctx.user.id,
          QueuePriority.Default,
          nextRevision,
        );
      }
      await enqueueSearchIndex(input.bookmarkId, ctx.user.id);

      const updated = await getTranscript(ctx, input.bookmarkId);
      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Transcript disappeared after update",
        });
      }
      return serializeTranscript(updated);
    }),

  reset: transcriptsProcedure
    .input(zResetTranscriptRequestSchema)
    .output(zTranscriptResponseSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const transcript = await getTranscript(ctx, input.bookmarkId);
      if (!transcript?.sourceTranscript) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No source transcript is available to restore",
        });
      }

      const textChanged = transcript.text !== transcript.sourceTranscript;
      const nextRevision = transcript.revision + (textChanged ? 1 : 0);
      const summarySettings = await getSummarySettings(ctx);
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, input.bookmarkId),
        columns: { summaryProvenance: true },
      });
      const summaryIsManual = bookmark?.summaryProvenance === "manual";

      await ctx.db.transaction(async (tx) => {
        const result = await tx
          .update(bookmarkTranscripts)
          .set({
            text: transcript.sourceTranscript,
            manualOverride: false,
            revision: nextRevision,
            modifiedAt: new Date(),
          })
          .where(
            and(
              eq(bookmarkTranscripts.id, transcript.id),
              eq(bookmarkTranscripts.revision, transcript.revision),
            ),
          );

        if (result.changes === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Transcript changed since it was loaded",
          });
        }

        if (!textChanged || summaryIsManual) return;

        await tx
          .update(bookmarks)
          .set({
            summaryProvenance: "transcript",
            summaryStale: true,
            ...(summarySettings.enabled
              ? { summarizationStatus: "pending" as const }
              : {}),
            modifiedAt: new Date(),
          })
          .where(eq(bookmarks.id, input.bookmarkId));
      });

      if (textChanged && !summaryIsManual && summarySettings.enabled) {
        await enqueueTranscriptSummary(
          input.bookmarkId,
          ctx.user.id,
          QueuePriority.Default,
          nextRevision,
        );
      }
      await enqueueSearchIndex(input.bookmarkId, ctx.user.id);

      const updated = await getTranscript(ctx, input.bookmarkId);
      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Transcript disappeared after reset",
        });
      }
      return serializeTranscript(updated);
    }),

  retry: transcriptsProcedure
    .use(
      createRateLimitMiddleware({
        name: "transcripts.retry",
        windowMs: 30 * 60 * 1000,
        maxRequests: 50,
      }),
    )
    .input(zRetryTranscriptRequestSchema)
    .output(z.object({ queued: z.literal(true) }))
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, input.bookmarkId),
        columns: { type: true },
        with: {
          link: { columns: { url: true } },
          asset: { columns: { assetType: true, assetId: true } },
        },
      });
      const videoId = bookmark?.link
        ? getYouTubeVideoId(bookmark.link.url)
        : null;
      const isMediaBookmark =
        bookmark?.type === "asset" &&
        (bookmark.asset?.assetType === "video" ||
          bookmark.asset?.assetType === "audio");
      if (!videoId && !isMediaBookmark) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Transcript retry is only available for YouTube links or audio/video bookmarks",
        });
      }
      if (isMediaBookmark && !serverConfig.transcription.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Audio/video transcription is disabled",
        });
      }

      const provider = videoId ? "youtube" : "azure-speech";
      const providerItemId = videoId ?? bookmark?.asset?.assetId;
      if (!providerItemId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transcript source is missing",
        });
      }

      await ctx.db
        .insert(bookmarkTranscripts)
        .values({
          bookmarkId: input.bookmarkId,
          provider,
          providerItemId,
          status: "pending",
          sourceAttachmentsStatus: "pending",
        })
        .onConflictDoUpdate({
          target: [
            bookmarkTranscripts.bookmarkId,
            bookmarkTranscripts.provider,
          ],
          set: {
            providerItemId,
            status: "pending",
            statusMessage: null,
            sourceAttachmentsStatus: "pending",
          },
        });

      await TranscriptQueue.enqueue(
        { bookmarkId: input.bookmarkId },
        { groupId: ctx.user.id, priority: QueuePriority.Default },
      );
      return { queued: true as const };
    }),
});
