import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LibraryStore } from "@karakeep/db";
import { bindLibraryStore } from "@karakeep/db";
import { createBetterSqliteStore } from "@karakeep/db/betterSqliteStore";
import { getMigrationsFolder } from "@karakeep/db/drizzle";
import { definePersist, runPersist } from "@karakeep/db/persist";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarkTranscripts,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  clearPendingEnrichment,
  convertLinkToAssetBookmark,
  replaceAsset,
  saveCrawlResult,
  saveTranscriptSource,
} from ".";

let store: LibraryStore;
let userId: string;
let bookmarkId: string;

beforeEach(async () => {
  store = createBetterSqliteStore({
    path: ":memory:",
    migrationsFolder: getMigrationsFolder(),
  });
  store.migrate();
  bindLibraryStore(store);
  const [user] = await store.db
    .insert(users)
    .values({ name: "A", email: "a@test.com" })
    .returning();
  userId = user.id;
  const [bookmark] = await store.db
    .insert(bookmarks)
    .values({ userId, type: BookmarkTypes.LINK })
    .returning();
  bookmarkId = bookmark.id;
  await store.db
    .insert(bookmarkLinks)
    .values({ id: bookmarkId, url: "https://example.com/file.png" });
});

afterEach(() => store.close());

async function assetIds() {
  const rows = await store.db
    .select({ id: assets.id, assetType: assets.assetType })
    .from(assets)
    .where(eq(assets.bookmarkId, bookmarkId))
    .orderBy(assets.id);
  return rows;
}

function asset(
  id: string,
  assetType: (typeof AssetTypes)[keyof typeof AssetTypes],
) {
  return {
    id,
    bookmarkId,
    userId,
    assetType,
    contentType: "image/png",
    size: 1,
  };
}

describe("persist registry", () => {
  it("rejects duplicate names", () => {
    definePersist("test.unique", async () => undefined);
    expect(() => definePersist("test.unique", async () => undefined)).toThrow(
      /already registered/,
    );
  });

  it("passes inputs and results through JSON like a process boundary", async () => {
    const echo = definePersist<{ when: string }, { seen: string }>(
      "test.echo",
      async (_db, input) => ({ seen: typeof input.when }),
    );
    expect(await echo({ when: "x" })).toEqual({ seen: "string" });
    // A Date (which the types forbid) arrives as a string, as it would remotely.
    expect(
      await runPersist("test.echo", { when: new Date(0) as unknown as string }),
    ).toEqual({ seen: "string" });
  });
});

describe("job persist functions", () => {
  it("clears pending enrichment and fails a pending crawl", async () => {
    await store.db
      .update(bookmarks)
      .set({
        taggingStatus: "pending",
        summarizationStatus: "pending",
        embeddingStatus: "success",
      })
      .where(eq(bookmarks.id, bookmarkId));
    await store.db
      .update(bookmarkLinks)
      .set({ crawlStatus: "pending" })
      .where(eq(bookmarkLinks.id, bookmarkId));

    await clearPendingEnrichment({
      bookmarkId,
      statuses: ["tagging", "embedding"],
      failPendingCrawl: true,
    });

    const row = await store.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
    });
    expect(row?.taggingStatus).toBeNull();
    expect(row?.summarizationStatus).toBe("pending");
    expect(row?.embeddingStatus).toBe("success");
    const link = await store.db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, bookmarkId),
    });
    expect(link?.crawlStatus).toBe("failure");
  });

  it("replaces an asset row atomically", async () => {
    await replaceAsset({
      oldAssetId: null,
      asset: asset("a1", AssetTypes.LINK_VIDEO),
    });
    await replaceAsset({
      oldAssetId: "a1",
      asset: asset("a2", AssetTypes.LINK_VIDEO),
    });
    expect(await assetIds()).toEqual([
      { id: "a2", assetType: AssetTypes.LINK_VIDEO },
    ]);

    // A failing insert (duplicate id) must keep the old row.
    await store.db.insert(assets).values(asset("taken", AssetTypes.LINK_PDF));
    await expect(
      replaceAsset({
        oldAssetId: "a2",
        asset: asset("taken", AssetTypes.LINK_VIDEO),
      }),
    ).rejects.toThrow();
    expect((await assetIds()).map((row) => row.id)).toEqual(["a2", "taken"]);
  });

  it("converts a link bookmark into an asset bookmark", async () => {
    await convertLinkToAssetBookmark({
      bookmarkId,
      userId,
      url: "https://example.com/file.png",
      assetType: "image",
      fileName: "file.png",
      asset: { assetId: "img", contentType: "image/png", size: 10 },
    });

    const row = await store.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
    });
    expect(row?.type).toBe(BookmarkTypes.ASSET);
    expect(
      await store.db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, bookmarkId),
      }),
    ).toBeUndefined();
    const assetRow = await store.db.query.bookmarkAssets.findFirst({
      where: eq(bookmarkAssets.id, bookmarkId),
    });
    expect(assetRow).toMatchObject({
      assetId: "img",
      assetType: "image",
      fileName: "file.png",
      sourceUrl: "https://example.com/file.png",
    });
  });

  it("saves a crawl result and reports replaced assets", async () => {
    await store.db
      .insert(assets)
      .values([
        asset("old-shot", AssetTypes.LINK_SCREENSHOT),
        asset("old-image", AssetTypes.LINK_BANNER_IMAGE),
        asset("old-html", AssetTypes.LINK_HTML_CONTENT),
      ]);

    const { replacedAssetIds } = await saveCrawlResult({
      bookmarkId,
      userId,
      inlineHtmlContent: "<p>hi</p>",
      htmlContent: { result: "store_inline" },
      screenshot: {
        assetId: "new-shot",
        contentType: "image/png",
        fileName: "shot.png",
        size: 5,
      },
      pdf: null,
      image: null,
      hasPreviewImageUrl: false,
      old: {
        screenshotAssetId: "old-shot",
        pdfAssetId: null,
        imageAssetId: "old-image",
        contentAssetId: "old-html",
      },
    });

    expect(replacedAssetIds.sort()).toEqual([
      "old-html",
      "old-image",
      "old-shot",
    ]);
    expect(await assetIds()).toEqual([
      { id: "new-shot", assetType: AssetTypes.LINK_SCREENSHOT },
    ]);
    const link = await store.db.query.bookmarkLinks.findFirst({
      where: eq(bookmarkLinks.id, bookmarkId),
    });
    expect(link).toMatchObject({
      crawlStatus: "success",
      htmlContent: "<p>hi</p>",
      contentAssetId: null,
    });
  });

  it("keeps the banner image when a preview image URL exists", async () => {
    await store.db
      .insert(assets)
      .values(asset("old-image", AssetTypes.LINK_BANNER_IMAGE));
    const { replacedAssetIds } = await saveCrawlResult({
      bookmarkId,
      userId,
      inlineHtmlContent: null,
      htmlContent: { result: "not_stored" },
      screenshot: null,
      pdf: null,
      image: null,
      hasPreviewImageUrl: true,
      old: {
        screenshotAssetId: null,
        pdfAssetId: null,
        imageAssetId: "old-image",
        contentAssetId: null,
      },
    });
    expect(replacedAssetIds).toEqual([]);
    expect((await assetIds()).map((row) => row.id)).toEqual(["old-image"]);
  });

  describe("transcript sources", () => {
    const base = {
      provider: "youtube" as const,
      providerItemId: "video",
      sourceLanguage: "en",
      sourceIsAutoGenerated: false,
      selectedTrackId: "track.en.vtt",
      sourceAttachmentsStatus: "ready" as const,
      statusMessage: null,
      shouldSummarize: true,
    };

    beforeEach(async () => {
      await store.db.insert(bookmarkTranscripts).values({
        bookmarkId,
        provider: "youtube",
        providerItemId: "video",
        status: "pending",
        revision: 1,
        sourceFingerprint: "old",
        text: "old text",
      });
    });

    it("bumps the revision and marks the summary stale on a new source", async () => {
      const result = await saveTranscriptSource({
        ...base,
        bookmarkId,
        userId,
        sourceTranscript: "new text",
        sourceFingerprint: "new",
        captionAssets: [
          {
            assetId: "cap",
            size: 3,
            contentType: "text/vtt",
            fileName: "track.en.vtt",
          },
        ],
      });

      expect(result).toEqual({
        sourceChanged: true,
        manualOverride: false,
        nextRevision: 2,
      });
      const transcript = await store.db.query.bookmarkTranscripts.findFirst({
        where: eq(bookmarkTranscripts.bookmarkId, bookmarkId),
      });
      expect(transcript).toMatchObject({
        status: "ready",
        text: "new text",
        revision: 2,
        sourceFingerprint: "new",
      });
      const row = await store.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
      });
      expect(row).toMatchObject({
        summaryProvenance: "transcript",
        summaryStale: true,
        summarizationStatus: "pending",
      });
      expect(await assetIds()).toEqual([
        { id: "cap", assetType: AssetTypes.CAPTION_SOURCE },
      ]);
    });

    it("never overwrites a manual transcript edit", async () => {
      // Saved by the user while the job was running.
      await store.db
        .update(bookmarkTranscripts)
        .set({ manualOverride: true, text: "my edit" })
        .where(eq(bookmarkTranscripts.bookmarkId, bookmarkId));

      const result = await saveTranscriptSource({
        ...base,
        bookmarkId,
        userId,
        sourceTranscript: "new text",
        sourceFingerprint: "new",
      });

      expect(result).toEqual({
        sourceChanged: true,
        manualOverride: true,
        nextRevision: 1,
      });
      const transcript = await store.db.query.bookmarkTranscripts.findFirst({
        where: eq(bookmarkTranscripts.bookmarkId, bookmarkId),
      });
      expect(transcript?.text).toBe("my edit");
      expect(transcript?.sourceTranscript).toBe("new text");
    });
  });
});
