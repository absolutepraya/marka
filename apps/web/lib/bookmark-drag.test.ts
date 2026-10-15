import { describe, expect, it } from "vitest";

import {
  BOOKMARK_DRAG_MIME,
  BOOKMARK_SOURCE_LIST_MIME,
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
