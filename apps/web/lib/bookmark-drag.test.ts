import { describe, expect, it, vi } from "vitest";

import {
  BOOKMARK_DRAG_MIME,
  BOOKMARK_BATCH_DRAG_MIME,
  BOOKMARK_SOURCE_LIST_MIME,
  getBookmarkDragData,
  dropBookmarks,
  setBookmarkDragData,
} from "./bookmark-drag";

describe("bookmark drag data", () => {
  const roles = ["owner", "editor", "viewer", "public"] as const;
  const types = ["manual", "smart"] as const;

  it.each(
    types.flatMap((type) => roles.map((userRole) => ({ type, userRole }))),
  )(
    "offers the permitted drag operation for a $userRole in a $type list",
    ({ type, userRole }) => {
      const data = new Map<string, string>();
      const transfer: Pick<DataTransfer, "setData" | "effectAllowed"> = {
        setData: (key, value) => {
          data.set(key, value);
        },
        effectAllowed: "uninitialized",
      };
      setBookmarkDragData(transfer, "bookmark", {
        id: "source",
        type,
        userRole,
      });
      expect(data.get(BOOKMARK_DRAG_MIME)).toBe("bookmark");
      const canMove =
        type === "manual" && ["owner", "editor"].includes(userRole);
      expect(data.get(BOOKMARK_SOURCE_LIST_MIME)).toBe(
        canMove ? "source" : undefined,
      );
      expect(transfer.effectAllowed).toBe(canMove ? "copyMove" : "copy");
    },
  );

  it("allows copying from a view without a list context", () => {
    const data = new Map<string, string>();
    const transfer: Pick<DataTransfer, "setData" | "effectAllowed"> = {
      setData: (key, value) => {
        data.set(key, value);
      },
      effectAllowed: "uninitialized",
    };
    setBookmarkDragData(transfer, "bookmark");
    expect(data.get(BOOKMARK_DRAG_MIME)).toBe("bookmark");
    expect(data.has(BOOKMARK_SOURCE_LIST_MIME)).toBe(false);
    expect(transfer.effectAllowed).toBe("copy");
  });
});

describe("bookmark batch drops", () => {
  it("round trips a deduplicated selection and its source", () => {
    const values = new Map<string, string>();
    const transfer = {
      setData: (key: string, value: string) => values.set(key, value),
      getData: (key: string) => values.get(key) ?? "",
      effectAllowed: "uninitialized" as DataTransfer["effectAllowed"],
    };
    setBookmarkDragData(
      transfer,
      ["a", "b", "a"],
      { id: "source", type: "manual", userRole: "editor" },
      7,
    );
    expect(getBookmarkDragData(transfer)).toEqual({
      bookmarkIds: ["a", "b"],
      sourceListId: "source",
      selectionSession: 7,
    });
  });

  it.each([
    "not-json",
    "null",
    '{"bookmarkIds":[]}',
    '{"bookmarkIds":["a",null]}',
  ])(
    "rejects invalid batch data instead of dropping only its first bookmark: %s",
    (batch) => {
      expect(
        getBookmarkDragData({
          getData: (key) => (key === BOOKMARK_BATCH_DRAG_MIME ? batch : "a"),
        }),
      ).toBeNull();
    },
  );

  it("retains destination membership after a removal failure and never removes an item whose add failed", async () => {
    const destination = new Set<string>();
    const source = new Set(["done", "add-fails", "remove-fails"]);
    const addToList = vi.fn(async ({ bookmarkId }: { bookmarkId: string }) => {
      if (bookmarkId === "add-fails") throw new Error("add failed");
      destination.add(bookmarkId);
    });
    const removeFromList = vi.fn(
      async ({ bookmarkId }: { bookmarkId: string }) => {
        expect(destination.has(bookmarkId)).toBe(true);
        if (bookmarkId === "remove-fails") throw new Error("remove failed");
        source.delete(bookmarkId);
      },
    );
    const result = await dropBookmarks({
      bookmarkIds: [...source],
      sourceListId: "source",
      targetListId: "target",
      addToList,
      removeFromList,
    });
    expect(result).toEqual({
      isMove: true,
      completedIds: ["done"],
      addedOnlyIds: ["remove-fails"],
      failedIds: ["add-fails"],
    });
    expect([...source]).toEqual(["add-fails", "remove-fails"]);
    expect([...destination]).toEqual(["done", "remove-fails"]);
    expect(removeFromList).not.toHaveBeenCalledWith({
      bookmarkId: "add-fails",
      listId: "source",
    });
    // An idempotent retry completes only the unfinished source removal.
    const retried = await dropBookmarks({
      bookmarkIds: ["remove-fails"],
      sourceListId: "source",
      targetListId: "target",
      addToList,
      removeFromList: async ({ bookmarkId }) => {
        source.delete(bookmarkId);
      },
    });
    expect(retried?.completedIds).toEqual(["remove-fails"]);
    expect([...destination]).toEqual(["done", "remove-fails"]);
  });

  it("does nothing when dropped onto the source", async () => {
    const mutation = vi.fn();
    expect(
      await dropBookmarks({
        bookmarkIds: ["a", "b"],
        sourceListId: "same",
        targetListId: "same",
        addToList: mutation,
        removeFromList: mutation,
      }),
    ).toBeNull();
    expect(mutation).not.toHaveBeenCalled();
  });

  it("adds without removing when dragged from a view without an editable manual source", async () => {
    const addToList = vi.fn(async () => undefined);
    const removeFromList = vi.fn();
    const result = await dropBookmarks({
      bookmarkIds: ["a", "b", "a"],
      targetListId: "target",
      addToList,
      removeFromList,
    });
    expect(result?.completedIds).toEqual(["a", "b"]);
    expect(result?.isMove).toBe(false);
    expect(addToList).toHaveBeenCalledTimes(2);
    expect(removeFromList).not.toHaveBeenCalled();
  });
});
