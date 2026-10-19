import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  assets,
  AssetTypes,
  bookmarkTranscripts,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("bookmark portability", () => {
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
