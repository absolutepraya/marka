import { expect, it } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { getApiCaller, getTestDB, seedUsers } from "../../testUtils";

// Mirrors the import worker, which processes staged bookmarks in parallel:
// each request inserts tags while other requests hold transactions.
it("handles concurrent tag updates that overlap with open transactions", async () => {
  const db = getTestDB();
  const [user] = await seedUsers(db);
  const caller = getApiCaller(db, user.id, user.email);
  const tagSets = [
    ["tag1", "tag2"],
    ["imported", "full"],
    ["text-tag", "imported"],
    ["complete", "text"],
  ];

  const results = await Promise.allSettled(
    tagSets.map(async (tags, i) => {
      const bookmark = await caller.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: `bookmark ${i}`,
      });
      await caller.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: tags.map((tagName) => ({ tagName })),
        detach: [],
      });
      return bookmark.id;
    }),
  );

  expect(results.filter((r) => r.status === "rejected")).toEqual([]);
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const bookmark = await caller.bookmarks.getBookmark({
      bookmarkId: result.value,
    });
    expect(bookmark.tags).toHaveLength(2);
  }
});
