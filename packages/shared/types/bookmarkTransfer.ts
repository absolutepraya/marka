import { z } from "zod";
import { getSupportedMimeTypes } from "../content-support";

import { zAssetTypesSchema, zBookmarkSchema } from "./bookmarks";
import { zHighlightSchema } from "./highlights";
import { zTranscriptSchema } from "./transcripts";

// The serialized archive version and the per-bookmark transfer version are
// independent. Account identity and live sharing grants are never imported.
export const BOOKMARK_TRANSFER_VERSION = 1;
export const PORTABLE_DATA_EXCLUSIONS = [
  "account credentials and API keys",
  "secret-protected webhooks (reference metadata only)",
  "bookmarks owned by other users",
  "live sharing grants and invitations (reference metadata only)",
  "feed import history, server jobs, and search indexes",
  "unattached assets, avatars, and server backup archives",
  "derived asset processing metadata",
] as const;

export const zTransferAssetSchema = z.object({
  id: z.string(),
  assetType: zAssetTypesSchema.exclude(["avatar", "unknown"]),
  transcriptId: z.string().nullable(),
  fileName: z.string().nullable(),
  contentType: z
    .string()
    .refine(
      (value) => getSupportedMimeTypes("rawDownload").has(value),
      "Unsupported portable asset MIME type",
    ),
  size: z.number().int().nonnegative(),
});

export const zReadingProgressSchema = z.object({
  readingProgressOffset: z.number().int().nonnegative().nullable(),
  readingProgressAnchor: z.string().nullable(),
  readingProgressPercent: z.number().int().min(0).max(100).nullable(),
  readingProgressRevision: z.number().int().nonnegative().nullable(),
});

export const zBookmarkTransferSchema = z.object({
  version: z.literal(BOOKMARK_TRANSFER_VERSION),
  bookmark: zBookmarkSchema,
  transcripts: z.array(zTranscriptSchema),
  highlights: z.array(zHighlightSchema),
  progress: zReadingProgressSchema.nullable(),
  assets: z.array(zTransferAssetSchema),
});
export type BookmarkTransfer = z.infer<typeof zBookmarkTransferSchema>;
