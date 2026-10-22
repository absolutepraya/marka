import { eq } from "drizzle-orm";

import { definePersist } from "@karakeep/db/persist";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { AssetRecord } from "./assets";
import { updateAsset } from "./assets";

// Type aliases, not interfaces: persist inputs must satisfy JsonValue.
// oxlint-disable-next-line typescript-eslint/consistent-type-definitions
type StoredFile = {
  assetId: string;
  contentType: string;
  fileName: string | null;
  size: number;
};

/**
 * Turns a link bookmark whose URL served an image or PDF into an asset
 * bookmark that owns the downloaded file.
 */
export const convertLinkToAssetBookmark = definePersist<
  {
    bookmarkId: string;
    userId: string;
    url: string;
    assetType: "image" | "pdf";
    fileName: string;
    asset: { assetId: string; contentType: string; size: number };
  },
  void
>(
  "crawler.convertLinkToAssetBookmark",
  (db, { bookmarkId, userId, url, assetType, fileName, asset }) =>
    db.transaction(async (trx) => {
      await updateAsset(
        undefined,
        {
          id: asset.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.BOOKMARK_ASSET,
          contentType: asset.contentType,
          size: asset.size,
          fileName,
        },
        trx,
      );
      await trx.insert(bookmarkAssets).values({
        id: bookmarkId,
        assetType,
        assetId: asset.assetId,
        content: null,
        fileName,
        sourceUrl: url,
      });
      await trx
        .update(bookmarks)
        .set({ type: BookmarkTypes.ASSET })
        .where(eq(bookmarks.id, bookmarkId));
      await trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId));
    }),
);

/**
 * Records a successful crawl and swaps in its newly stored files. Returns the
 * replaced asset ids; the caller deletes their files after this commits.
 */
export const saveCrawlResult = definePersist<
  {
    bookmarkId: string;
    userId: string;
    inlineHtmlContent: string | null;
    htmlContent:
      | { result: "stored"; assetId: string; size: number; contentType: string }
      | { result: "store_inline" }
      | { result: "not_stored" };
    screenshot: StoredFile | null;
    pdf: StoredFile | null;
    image: AssetRecord | null;
    hasPreviewImageUrl: boolean;
    old: {
      screenshotAssetId: string | null;
      pdfAssetId: string | null;
      imageAssetId: string | null;
      contentAssetId: string | null;
    };
  },
  { replacedAssetIds: string[] }
>("crawler.saveCrawlResult", (db, input) =>
  db.transaction(async (txn) => {
    const { bookmarkId, userId, htmlContent, screenshot, pdf, image, old } =
      input;
    const replaced: (string | null)[] = [];

    await txn
      .update(bookmarkLinks)
      .set({
        crawledAt: new Date(),
        crawlStatus: "success",
        htmlContent: input.inlineHtmlContent,
        contentAssetId:
          htmlContent.result === "stored" ? htmlContent.assetId : null,
      })
      .where(eq(bookmarkLinks.id, bookmarkId));

    if (screenshot) {
      await updateAsset(
        old.screenshotAssetId,
        {
          id: screenshot.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_SCREENSHOT,
          contentType: screenshot.contentType,
          size: screenshot.size,
          fileName: screenshot.fileName,
        },
        txn,
      );
      replaced.push(old.screenshotAssetId);
    } else if (image && old.screenshotAssetId) {
      await txn.delete(assets).where(eq(assets.id, old.screenshotAssetId));
      replaced.push(old.screenshotAssetId);
    }

    if (pdf) {
      await updateAsset(
        old.pdfAssetId,
        {
          id: pdf.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_PDF,
          contentType: pdf.contentType,
          size: pdf.size,
          fileName: pdf.fileName,
        },
        txn,
      );
      replaced.push(old.pdfAssetId);
    }

    if (image) {
      await updateAsset(old.imageAssetId, image, txn);
      replaced.push(old.imageAssetId);
    } else if (!input.hasPreviewImageUrl && old.imageAssetId) {
      await txn.delete(assets).where(eq(assets.id, old.imageAssetId));
      replaced.push(old.imageAssetId);
    }

    if (htmlContent.result === "stored") {
      await updateAsset(
        old.contentAssetId,
        {
          id: htmlContent.assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_HTML_CONTENT,
          contentType: htmlContent.contentType,
          size: htmlContent.size,
          fileName: null,
        },
        txn,
      );
      replaced.push(old.contentAssetId);
    } else if (old.contentAssetId) {
      await txn.delete(assets).where(eq(assets.id, old.contentAssetId));
      replaced.push(old.contentAssetId);
    }

    return {
      replacedAssetIds: replaced.filter((id): id is string => !!id),
    };
  }),
);
