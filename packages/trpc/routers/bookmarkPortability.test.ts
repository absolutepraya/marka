import { beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assets,
  AssetTypes,
  bookmarkTranscripts,
  bookmarkLinks,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import logger from "@karakeep/shared/logger";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("bookmark portability", () => {
  test<CustomTestContext>("returns the committed import when search enqueue fails", async ({
    apiCallers,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Keep this committed import",
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    const { triggerSearchReindex } = await import("@karakeep/shared-server");
    const enqueue = vi
      .mocked(triggerSearchReindex)
      .mockRejectedValueOnce(new Error("queue unavailable"));
    const warning = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    try {
      const result = await dest.bookmarkPortability.import({
        snapshot,
        assetIds: {},
      });
      expect(result.bookmarkId).toBeTruthy();
      expect((await dest.bookmarks.getBookmarks({})).bookmarks).toEqual([
        expect.objectContaining({ id: result.bookmarkId }),
      ]);
      expect(enqueue).toHaveBeenLastCalledWith(result.bookmarkId);
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Bookmark ${result.bookmarkId} imported, but search reindex enqueue failed: queue unavailable`,
        ),
      );
    } finally {
      warning.mockRestore();
      enqueue.mockReset();
    }
  });

  test<CustomTestContext>("accepts HTML page archives and avoids duplicating cached HTML inline", async ({
    apiCallers,
    db,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.test/archived",
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    if (snapshot.bookmark.content.type !== "link")
      throw new Error("Expected a link snapshot");
    snapshot.bookmark.content.htmlContent = "<html>cached</html>";
    snapshot.bookmark.content.contentAssetId = "source-cache";
    const destination = await dest.users.whoami();
    for (const [id, type] of [
      ["cache", "linkHtmlContent"],
      ["archive", "fullPageArchive"],
    ] as const) {
      snapshot.assets.push({
        id: `source-${id}`,
        assetType: type,
        contentType: "text/html",
        size: 10,
        fileName: `${id}.html`,
        transcriptId: null,
      });
      await db.insert(assets).values({
        id: `dest-${id}`,
        userId: destination.id,
        assetType: AssetTypes.UNKNOWN,
        contentType: "text/html",
        size: 10,
      });
    }
    const result = await dest.bookmarkPortability.import({
      snapshot,
      assetIds: {
        "source-cache": "dest-cache",
        "source-archive": "dest-archive",
      },
    });
    expect(
      await db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, result.bookmarkId),
      }),
    ).toMatchObject({ htmlContent: null, contentAssetId: "dest-cache" });
    expect(
      await db.query.assets.findFirst({ where: eq(assets.id, "dest-archive") }),
    ).toMatchObject({
      bookmarkId: result.bookmarkId,
      assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    });
  });

  test<CustomTestContext>("preserves inline cached HTML when no content asset is attached", async ({
    apiCallers,
    db,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.test/inline",
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    if (snapshot.bookmark.content.type !== "link")
      throw new Error("Expected a link snapshot");
    snapshot.bookmark.content.htmlContent = "<html>inline fallback</html>";
    const result = await dest.bookmarkPortability.import({
      snapshot,
      assetIds: {},
    });
    expect(
      await db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, result.bookmarkId),
      }),
    ).toMatchObject({
      htmlContent: "<html>inline fallback</html>",
      contentAssetId: null,
    });
  });

  test<CustomTestContext>("copies owned text and annotations without reusing identities or grants", async ({
    apiCallers,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Plain body",
      format: "plain",
    });
    await source.highlights.create({
      bookmarkId: bookmark.id,
      startOffset: 0,
      endOffset: 5,
      text: "Plain",
      note: "annotation",
      color: "blue",
    });
    await source.bookmarks.updateReadingProgress({
      bookmarkId: bookmark.id,
      readingProgressOffset: 3,
      readingProgressPercent: 30,
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    const imported = await dest.bookmarkPortability.import({
      snapshot,
      assetIds: {},
    });
    expect(imported.bookmarkId).not.toBe(bookmark.id);
    const restored = await dest.bookmarks.getBookmark({
      bookmarkId: imported.bookmarkId,
    });
    expect(restored.content).toMatchObject({
      type: BookmarkTypes.TEXT,
      text: "Plain body",
      format: "plain",
    });
    expect(restored.userId).toBe((await dest.users.whoami()).id);
    expect((await dest.highlights.getAll({})).highlights).toEqual([
      expect.objectContaining({
        note: "annotation",
        bookmarkId: imported.bookmarkId,
      }),
    ]);
    expect(
      await dest.bookmarks.getReadingProgress({
        bookmarkId: imported.bookmarkId,
      }),
    ).toMatchObject({ readingProgressOffset: 3, readingProgressPercent: 30 });
    expect(
      (
        await dest.bookmarks.getContentPermissions({
          bookmarkId: imported.bookmarkId,
        })
      ).editors,
    ).toEqual([]);
  });

  test<CustomTestContext>("preserves source and edited transcripts and revisions", async ({
    apiCallers,
    db,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    await db.insert(bookmarkTranscripts).values({
      bookmarkId: bookmark.id,
      provider: "youtube",
      providerItemId: "abcdefghijk",
      status: "ready",
      sourceTranscript: "Source",
      text: "Working edit",
      revision: 7,
      manualOverride: true,
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    const result = await dest.bookmarkPortability.import({
      snapshot,
      assetIds: {},
    });
    expect(
      await dest.transcripts.get({ bookmarkId: result.bookmarkId }),
    ).toMatchObject({
      sourceTranscript: "Source",
      text: "Working edit",
      revision: 7,
      manualOverride: true,
    });
    await expect(
      dest.bookmarkPortability.import({ snapshot, assetIds: {} }),
    ).rejects.toThrow(/already contains this URL/);
    expect((await dest.bookmarks.getBookmarks({})).bookmarks).toHaveLength(1);
  });

  test<CustomTestContext>("requires ownership and independent resource scopes", async ({
    apiCallers,
    db,
  }) => {
    const [owner, other] = apiCallers;
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Private",
    });
    await owner.highlights.create({
      bookmarkId: bookmark.id,
      startOffset: 0,
      endOffset: 1,
      text: "P",
      note: null,
      color: "yellow",
    });
    await expect(
      other.bookmarkPortability.export({ bookmarkId: bookmark.id }),
    ).rejects.toThrow();
    const user = await owner.users.whoami();
    const scoped = getApiCaller(db, user.id, user.email ?? undefined, "user", {
      type: "apiKey",
      keyId: "scope-test",
      scopes: ["bookmarks:readwrite"],
    });
    await expect(
      scoped.bookmarkPortability.export({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/highlights:read/);
    const snapshot = await owner.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    await expect(
      scoped.bookmarkPortability.import({ snapshot, assetIds: {} }),
    ).rejects.toThrow(/highlights:readwrite/);
  });

  test<CustomTestContext>("rejects foreign uploads atomically and respects bookmark quota", async ({
    apiCallers,
    db,
  }) => {
    const [source, dest] = apiCallers;
    const bookmark = await source.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Body",
    });
    const snapshot = await source.bookmarkPortability.export({
      bookmarkId: bookmark.id,
    });
    const sourceUser = await source.users.whoami();
    await db.insert(assets).values({
      id: "foreign-upload",
      userId: sourceUser.id,
      assetType: AssetTypes.UNKNOWN,
      contentType: "image/png",
      size: 1,
    });
    snapshot.assets.push({
      id: "original-image",
      assetType: "userUploaded",
      transcriptId: null,
      fileName: "image.png",
      contentType: "image/png",
      size: 1,
    });
    await expect(
      dest.bookmarkPortability.import({
        snapshot,
        assetIds: { "original-image": "foreign-upload" },
      }),
    ).rejects.toThrow(/unavailable/);
    expect((await dest.bookmarks.getBookmarks({})).bookmarks).toHaveLength(0);
    snapshot.assets = [];
    const destination = await dest.users.whoami();
    await db
      .update(users)
      .set({ bookmarkQuota: 0 })
      .where(eq(users.id, destination.id));
    await expect(
      dest.bookmarkPortability.import({ snapshot, assetIds: {} }),
    ).rejects.toThrow(/quota/);
  });
});
