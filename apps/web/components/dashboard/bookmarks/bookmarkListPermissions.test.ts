import { describe, expect, test } from "vitest";

import {
  canRemoveBookmarkFromList,
  canSelectBookmarkForBulkActions,
} from "./bookmarkListPermissions";

describe("bookmark list action permissions", () => {
  test("viewer cannot remove a bookmark even when they own it", () => {
    expect(
      canRemoveBookmarkFromList({
        listId: "list",
        listType: "manual",
        userRole: "viewer",
      }),
    ).toBe(false);
  });

  test("editor and owner can remove from a manual list", () => {
    for (const userRole of ["editor", "owner"] as const) {
      expect(
        canRemoveBookmarkFromList({
          listId: "list",
          listType: "manual",
          userRole,
        }),
      ).toBe(true);
    }
  });

  test("remove action requires a manual list context", () => {
    expect(
      canRemoveBookmarkFromList({
        listId: undefined,
        listType: "manual",
        userRole: "editor",
      }),
    ).toBe(false);
    expect(
      canRemoveBookmarkFromList({
        listId: "smart",
        listType: "smart",
        userRole: "editor",
      }),
    ).toBe(false);
  });
});

describe("bulk bookmark selection permissions", () => {
  test("owned bookmarks remain selectable outside an editable list", () => {
    expect(
      canSelectBookmarkForBulkActions({
        bookmarkOwnerId: "me",
        currentUserId: "me",
      }),
    ).toBe(true);
  });
  test.each(["owner", "editor"] as const)(
    "%s can select shared bookmarks in manual lists",
    (userRole) => {
      expect(
        canSelectBookmarkForBulkActions({
          bookmarkOwnerId: "other",
          currentUserId: "me",
          listContext: { id: "list", type: "manual", userRole },
        }),
      ).toBe(true);
    },
  );
  test.each(["viewer", "public"] as const)(
    "%s cannot select another user's bookmarks",
    (userRole) => {
      expect(
        canSelectBookmarkForBulkActions({
          bookmarkOwnerId: "other",
          currentUserId: "me",
          listContext: { id: "list", type: "manual", userRole },
        }),
      ).toBe(false);
    },
  );
  test("shared bookmarks cannot be selected in smart lists or without a session", () => {
    expect(
      canSelectBookmarkForBulkActions({
        bookmarkOwnerId: "other",
        currentUserId: "me",
        listContext: { id: "list", type: "smart", userRole: "editor" },
      }),
    ).toBe(false);
    expect(
      canSelectBookmarkForBulkActions({
        bookmarkOwnerId: "other",
        currentUserId: undefined,
        listContext: { id: "list", type: "manual", userRole: "editor" },
      }),
    ).toBe(false);
  });
});
