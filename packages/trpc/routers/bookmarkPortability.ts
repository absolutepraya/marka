import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getYouTubeVideoId } from "@karakeep/shared/youtube";
import logger from "@karakeep/shared/logger";

import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarkTexts,
  bookmarkTranscripts,
  highlights,
  userReadingProgress,
  users,
  offlineSyncEvents,
} from "@karakeep/db/schema";
import { triggerSearchReindex } from "@karakeep/shared-server";
import {
  getBookmarkAssetTypeForMimeType,
  getSupportedMimeTypesForFormat,
  isContentTypeCompatibleWithAttachment,
} from "@karakeep/shared/content-support";
import {
  apiKeyScopesGrantScope,
  getApiKeyScope,
} from "@karakeep/shared/types/apiKeys";
import type { ZApiKeyScopeResource } from "@karakeep/shared/types/apiKeys";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { zBookmarkTransferSchema } from "@karakeep/shared/types/bookmarkTransfer";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import {
  mapDBAssetTypeToUserType,
  mapSchemaAssetTypeToDB,
} from "../lib/attachments";
import { Bookmark } from "../models/bookmarks";
import { ensureBookmarkOwnership } from "./bookmarks";

const portabilityProcedure = createScopedAuthedProcedure("bookmarks");
function requireScope(
  ctx: AuthedContext,
  resource: ZApiKeyScopeResource,
  write = false,
) {
  const scope = getApiKeyScope(resource, write ? "readwrite" : "read");
  if (
    ctx.auth?.type === "apiKey" &&
    !apiKeyScopesGrantScope(ctx.auth.scopes, scope)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `API key is missing required scope: ${scope}`,
    });
  }
}

function validateAttachment(type: string, mime: string) {
  if (type === "captionSource")
    return getSupportedMimeTypesForFormat("caption").has(mime);
  if (type === "fullPageArchive")
    return mime === "application/zip" || mime === "text/html";
  if (type === "linkHtmlContent") return mime === "text/html";
  return isContentTypeCompatibleWithAttachment(type, mime);
}

export const bookmarkPortabilityRouter = router({
  // Preflight before either CLI starts writing files or destination records.
  capabilities: portabilityProcedure.query(() => ({ version: 1 as const })),
  export: portabilityProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        includeAssets: z.boolean().default(true),
      }),
    )
    .output(zBookmarkTransferSchema)
    .use(ensureBookmarkOwnership)
    .query(async ({ ctx, input }) => {
      requireScope(ctx, "highlights");
      if (input.includeAssets) requireScope(ctx, "assets");
      const bookmark = (
        await Bookmark.fromId(ctx, input.bookmarkId, true)
      ).asZBookmark();
      const [transcripts, annotations, progress, attachments] =
        await Promise.all([
          ctx.db.query.bookmarkTranscripts.findMany({
            where: eq(bookmarkTranscripts.bookmarkId, input.bookmarkId),
          }),
          ctx.db.query.highlights.findMany({
            where: and(
              eq(highlights.bookmarkId, input.bookmarkId),
              eq(highlights.userId, ctx.user.id),
            ),
          }),
          ctx.db.query.userReadingProgress.findFirst({
            where: and(
              eq(userReadingProgress.bookmarkId, input.bookmarkId),
              eq(userReadingProgress.userId, ctx.user.id),
            ),
          }),
          input.includeAssets
            ? ctx.db.query.assets.findMany({
                where: and(
                  eq(assets.bookmarkId, input.bookmarkId),
                  eq(assets.userId, ctx.user.id),
                  eq(assets.cleanupPending, false),
                ),
              })
            : [],
        ]);
      return {
        version: 1 as const,
        bookmark,
        transcripts,
        highlights: annotations,
        progress: progress ?? null,
        assets: attachments.map((a) => ({
          ...a,
          contentType: a.contentType ?? "application/octet-stream",
          assetType: mapDBAssetTypeToUserType(a.assetType) as Exclude<
            ReturnType<typeof mapDBAssetTypeToUserType>,
            "avatar" | "unknown"
          >,
        })),
      };
    }),
  import: portabilityProcedure
    .input(
      z.object({
        snapshot: zBookmarkTransferSchema,
        assetIds: z.record(z.string(), z.string()),
      }),
    )
    .output(z.object({ bookmarkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { snapshot, assetIds } = input;
      const original = snapshot.bookmark;
      const content = original.content;
      if (original.content.type === "unknown") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported bookmark type",
        });
      }
      if (content.type === "link" && !z.url().safeParse(content.url).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid bookmark URL",
        });
      }
      if (
        snapshot.transcripts.some((transcript) =>
          transcript.provider === "youtube"
            ? content.type !== "link" || !getYouTubeVideoId(content.url)
            : content.type !== "asset" ||
              !["audio", "video"].includes(content.assetType),
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transcript provider does not match bookmark source",
        });
      }
      if (snapshot.highlights.length) requireScope(ctx, "highlights", true);
      if (snapshot.assets.length) requireScope(ctx, "assets", true);
      // better-sqlite3 transactions must not yield. Use synchronous Drizzle
      // execution throughout so any validation failure rolls back every row.
      const result = ctx.db.transaction(
        (tx) => {
          const user = tx
            .select({ quota: users.bookmarkQuota })
            .from(users)
            .where(eq(users.id, ctx.user.id))
            .get();
          const used = tx
            .select({ value: count() })
            .from(bookmarks)
            .where(eq(bookmarks.userId, ctx.user.id))
            .get()!.value;
          if (user?.quota != null && used >= user.quota)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Bookmark quota exceeded",
            });
          if (original.content.type === "link") {
            const duplicate = tx
              .select({ id: bookmarkLinks.id })
              .from(bookmarkLinks)
              .innerJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
              .where(
                and(
                  eq(bookmarks.userId, ctx.user.id),
                  eq(bookmarkLinks.url, original.content.url),
                ),
              )
              .get();
            if (duplicate)
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "Destination already contains this URL; existing content was not overwritten",
              });
          }
          const [created] = tx
            .insert(bookmarks)
            .values({
              userId: ctx.user.id,
              type: original.content.type as
                | BookmarkTypes.LINK
                | BookmarkTypes.TEXT
                | BookmarkTypes.ASSET,
              title: original.title,
              note: original.note,
              archived: original.archived,
              favourited: original.favourited,
              summary: original.summary,
              summaryProvenance: original.summaryProvenance,
              summaryStale: original.summaryStale ?? false,
              createdAt: original.createdAt,
              modifiedAt: original.modifiedAt,
              source: original.source,
              taggingStatus:
                original.taggingStatus === "pending"
                  ? null
                  : original.taggingStatus,
              summarizationStatus:
                original.summarizationStatus === "pending"
                  ? null
                  : original.summarizationStatus,
              embeddingStatus: null,
            })
            .returning()
            .all();
          const transcriptIds = new Map<string, string>();
          for (const transcript of snapshot.transcripts) {
            const { id, bookmarkId: _bookmarkId, ...data } = transcript;
            const [saved] = tx
              .insert(bookmarkTranscripts)
              .values({
                ...data,
                // Preserve historical provider labels, source/working bodies,
                // and revisions. Source acquisition jobs are not transferred.
                status:
                  data.status === "pending"
                    ? data.text || data.sourceTranscript
                      ? "ready"
                      : "unavailable"
                    : data.status,
                sourceAttachmentsStatus:
                  data.sourceAttachmentsStatus === "pending"
                    ? "partial"
                    : data.sourceAttachmentsStatus,
                bookmarkId: created.id,
                // Media providers identify their source by the destination asset ID.
                providerItemId:
                  content.type === "asset"
                    ? (assetIds[content.assetId] ?? data.providerItemId)
                    : content.type === "link"
                      ? getYouTubeVideoId(content.url)!
                      : data.providerItemId,
              })
              .returning()
              .all();
            transcriptIds.set(id, saved.id);
          }
          const assigned = new Set<string>();
          for (const attachment of snapshot.assets) {
            const id = assetIds[attachment.id];
            if (!id || assigned.has(id))
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Missing or reused uploaded asset",
              });
            assigned.add(id);
            const uploaded = tx.query.assets
              .findFirst({
                where: and(
                  eq(assets.id, id),
                  eq(assets.userId, ctx.user.id),
                  eq(assets.cleanupPending, false),
                ),
              })
              .sync();
            if (
              !uploaded ||
              uploaded.bookmarkId ||
              uploaded.assetType !== AssetTypes.UNKNOWN ||
              uploaded.contentType !== attachment.contentType ||
              uploaded.size !== attachment.size
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Asset is unavailable or has a different content type",
              });
            }
            const primary =
              original.content.type === "asset" &&
              original.content.assetId === attachment.id;
            if (
              primary
                ? attachment.assetType !== "bookmarkAsset" ||
                  getBookmarkAssetTypeForMimeType(
                    uploaded.contentType ?? "",
                  ) !==
                    (original.content.type === "asset"
                      ? original.content.assetType
                      : null)
                : attachment.assetType === "bookmarkAsset" ||
                  !validateAttachment(
                    attachment.assetType,
                    attachment.contentType,
                  )
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Invalid attachment type",
              });
            }
            const transcriptId = attachment.transcriptId
              ? transcriptIds.get(attachment.transcriptId)
              : null;
            if (attachment.transcriptId && !transcriptId)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Missing transcript for attachment",
              });
            tx.update(assets)
              .set({
                bookmarkId: created.id,
                assetType: mapSchemaAssetTypeToDB(attachment.assetType),
                transcriptId,
                fileName: attachment.fileName,
              })
              .where(eq(assets.id, id))
              .run();
          }
          if (content.type === "text")
            tx.insert(bookmarkTexts)
              .values({
                id: created.id,
                text: content.text,
                format: content.format ?? "markdown",
                sourceUrl: content.sourceUrl,
              })
              .run();
          if (content.type === "link") {
            if (
              content.contentAssetId &&
              (!assigned.has(assetIds[content.contentAssetId]) ||
                !snapshot.assets.some(
                  (a) =>
                    a.id === content.contentAssetId &&
                    a.assetType === "linkHtmlContent",
                ))
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Missing cached content asset",
              });
            tx.insert(bookmarkLinks)
              .values({
                id: created.id,
                url: content.url,
                title: content.title,
                description: content.description,
                author: content.author,
                publisher: content.publisher,
                datePublished: content.datePublished,
                dateModified: content.dateModified,
                imageUrl: content.imageUrl,
                favicon: content.favicon,
                htmlContent: content.contentAssetId
                  ? null
                  : content.htmlContent,
                crawledAt: content.crawledAt,
                crawlStatus:
                  content.crawlStatus === "pending"
                    ? null
                    : content.crawlStatus,
                contentAssetId: content.contentAssetId
                  ? assetIds[content.contentAssetId]
                  : null,
              })
              .run();
          }
          if (content.type === "asset") {
            if (!assigned.has(assetIds[content.assetId]))
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Missing primary asset",
              });
            tx.insert(bookmarkAssets)
              .values({
                id: created.id,
                assetId: assetIds[content.assetId],
                assetType: content.assetType,
                fileName: content.fileName,
                content: content.content,
                sourceUrl: content.sourceUrl,
              })
              .run();
          }
          for (const annotation of snapshot.highlights) {
            const {
              id: _id,
              bookmarkId: _bookmarkId,
              userId: _userId,
              ...data
            } = annotation;
            tx.insert(highlights)
              .values({ ...data, bookmarkId: created.id, userId: ctx.user.id })
              .run();
          }
          if (
            snapshot.progress?.readingProgressOffset !== null &&
            snapshot.progress?.readingProgressOffset !== undefined
          ) {
            tx.insert(userReadingProgress)
              .values({
                ...snapshot.progress,
                readingProgressOffset: snapshot.progress.readingProgressOffset,
                bookmarkId: created.id,
                userId: ctx.user.id,
              })
              .run();
          }
          tx.insert(offlineSyncEvents)
            .values({
              userId: ctx.user.id,
              entityType: "bookmark",
              entityId: created.id,
              createdAt: new Date(),
              operation: "create",
              changedFields: [
                "title",
                "note",
                "summary",
                "archived",
                "favourited",
                ...(content.type === "text"
                  ? ["text"]
                  : content.type === "link"
                    ? ["url"]
                    : []),
              ],
            })
            .run();
          return { bookmarkId: created.id };
        },
        { behavior: "immediate" },
      );
      try {
        await triggerSearchReindex(result.bookmarkId);
      } catch (error) {
        // The import has committed. A derived-index failure must not invite a
        // retry that duplicates text or asset bookmarks.
        logger.warn(
          `Bookmark ${result.bookmarkId} imported, but search reindex enqueue failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return result;
    }),
});
