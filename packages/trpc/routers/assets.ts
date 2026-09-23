import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { bookmarkAssets, bookmarks } from "@karakeep/db/schema";
import {
  AssetPreprocessingQueue,
  QueuePriority,
} from "@karakeep/shared-server";
import {
  zAssetSchema,
  zAssetTypesSchema,
} from "@karakeep/shared/types/bookmarks";

import { createScopedAuthedProcedure, router } from "../index";
import { Asset } from "../models/assets";
import { ensureBookmarkOwnership } from "./bookmarks";

const assetsProcedure = createScopedAuthedProcedure("assets");

export const assetsAppRouter = router({
  list: assetsProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().nullish(),
      }),
    )
    .output(
      z.object({
        assets: z.array(
          z.object({
            id: z.string(),
            assetType: zAssetTypesSchema,
            size: z.number(),
            contentType: z.string().nullable(),
            fileName: z.string().nullable(),
            bookmarkId: z.string().nullable(),
          }),
        ),
        nextCursor: z.number().nullish(),
        totalCount: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await Asset.list(ctx, {
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
    }),
  attachAsset: assetsProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        asset: z.object({
          id: z.string(),
          assetType: zAssetTypesSchema,
        }),
      }),
    )
    .output(zAssetSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      return await Asset.attachAsset(ctx, input);
    }),
  deleteUnattachedAsset: assetsProcedure
    .input(z.object({ assetId: z.string() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      await Asset.deleteUnattached(ctx, input.assetId);
    }),
  replaceAsset: assetsProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        oldAssetId: z.string(),
        newAssetId: z.string(),
      }),
    )
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await Asset.replaceAsset(ctx, input);
    }),
  refreshAssetPreview: assetsProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const bookmarkAsset = await ctx.db.query.bookmarkAssets.findFirst({
        where: eq(bookmarkAssets.id, input.bookmarkId),
        columns: { assetType: true },
      });

      if (bookmarkAsset?.assetType !== "pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only PDF bookmark assets can refresh their preview",
        });
      }

      const previousState = await ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, input.bookmarkId),
        columns: {
          taggingStatus: true,
          summarizationStatus: true,
          modifiedAt: true,
        },
      });
      const refreshStartedAt = new Date();

      await ctx.db
        .update(bookmarks)
        .set({
          taggingStatus: "pending",
          summarizationStatus: "pending",
          modifiedAt: refreshStartedAt,
        })
        .where(eq(bookmarks.id, input.bookmarkId));

      try {
        await AssetPreprocessingQueue.enqueue(
          {
            bookmarkId: input.bookmarkId,
            fixMode: true,
            force: true,
          },
          {
            priority: QueuePriority.Low,
            groupId: ctx.user.id,
          },
        );
      } catch (error) {
        if (previousState) {
          await ctx.db
            .update(bookmarks)
            .set(previousState)
            .where(eq(bookmarks.id, input.bookmarkId));
        }
        throw error;
      }
    }),
  detachAsset: assetsProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        assetId: z.string(),
      }),
    )
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await Asset.detachAsset(ctx, input);
    }),
});
