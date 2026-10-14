import "fake-indexeddb/auto";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { offlineLibraryDb, purgeOfflineLibrary } from "./repository";
import { readSavedQuery, writeSavedQuery } from "./saved-queries";

beforeEach(async () => {
  await offlineLibraryDb.delete();
  await offlineLibraryDb.open();
  await offlineLibraryDb.metadata.put({
    key: "replicaOwnerUserId",
    value: "user-1",
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await offlineLibraryDb.delete();
});

test("keeps unused tags, counts, dates and list stat maps intact", async () => {
  const value = {
    tags: [{ name: "unused", numBookmarks: 0 }],
    date: new Date(123),
    stats: new Map([["list-1", 4]]),
  };
  await writeSavedQuery("user-1", "tags", value);
  expect(await readSavedQuery("user-1", "tags")).toEqual(value);
});

test("refuses reads and writes for another replica owner", async () => {
  await writeSavedQuery("user-1", "tags", ["Private tag"]);
  expect(await readSavedQuery("user-2", "tags")).toBeUndefined();
  await writeSavedQuery("user-2", "tags", ["Other account"]);
  expect(await readSavedQuery("user-1", "tags")).toEqual(["Private tag"]);
});

test("discards invalidated results and clears saved data with the library", async () => {
  await writeSavedQuery("user-1", "tags", ["Before deletion"]);
  await writeSavedQuery("user-1", "tags", undefined);
  expect(await readSavedQuery("user-1", "tags")).toBeUndefined();
  await writeSavedQuery("user-1", "lists", ["Folder"]);
  await purgeOfflineLibrary();
  expect(await offlineLibraryDb.metadata.count()).toBe(0);
});

test("expires old results and bounds the number of saved screens", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  await writeSavedQuery("user-1", "old", ["Old result"]);
  now.mockReturnValue(1000 + 25 * 60 * 60 * 1000);
  expect(await readSavedQuery("user-1", "old")).toBeUndefined();
  for (let i = 0; i < 33; i++) {
    now.mockReturnValue(1000 + 25 * 60 * 60 * 1000 + i);
    await writeSavedQuery("user-1", String(i), [i]);
  }
  expect(
    await offlineLibraryDb.metadata
      .where("key")
      .startsWith("savedQuery:")
      .count(),
  ).toBe(32);
  expect(await readSavedQuery("user-1", "32")).toEqual([32]);
});

test("saves the first page and its cursor while preserving the live object", async () => {
  const value = {
    pages: [{ tags: ["First"], nextCursor: { page: 1 } }, { tags: ["Second"] }],
    pageParams: [null, { page: 1 }],
  };
  await writeSavedQuery("user-1", "tags", value);
  expect(await readSavedQuery("user-1", "tags")).toEqual({
    pages: [value.pages[0]],
    pageParams: [null],
  });
  expect(value.pages).toHaveLength(2);
});
