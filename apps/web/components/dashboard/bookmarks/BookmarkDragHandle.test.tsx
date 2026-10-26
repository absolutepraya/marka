// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBookmarkDragData } from "@/lib/bookmark-drag";
import useBulkActionsStore from "@/lib/bulkActions";
import { useBookmarkDropTarget } from "@/lib/hooks/useBookmarkDropTarget";
import translations from "@/lib/i18n/locales/en/translation.json";
import { useBookmarkDragStore } from "@/lib/store/useBookmarkDragStore";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

const mocks = vi.hoisted(() => ({
  status: "online",
  add: vi.fn(async (_input: unknown) => undefined),
  remove: vi.fn(async (_input: unknown) => undefined),
  toast: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: { user: { id: "owner" } } }),
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({ kind: mocks.status }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: i18next.t.bind(i18next) }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: mocks.toast }));
vi.mock("@karakeep/shared-react/hooks/bookmark-list-context", () => ({
  useBookmarkListContext: () => ({
    id: "source",
    type: "manual",
    userRole: "owner",
  }),
}));
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useAddBookmarkToList: () => ({ mutateAsync: mocks.add }),
  useRemoveBookmarkFromList: () => ({ mutateAsync: mocks.remove }),
}));

import { BookmarkDragHandle } from "./BookmarkDragHandle";

function bookmark(id: string, userId = "owner") {
  return {
    id,
    userId,
    title: id,
    content: { type: "text", text: id },
  } as ZBookmark;
}
function transfer() {
  const values = new Map<string, string>();
  return {
    setData: (key: string, value: string) => values.set(key, value),
    getData: (key: string) => values.get(key) ?? "",
    get types() {
      return [...values.keys()];
    },
    setDragImage: vi.fn(),
    effectAllowed: "uninitialized",
    dropEffect: "none",
  };
}
function Harness({ item }: { item: ZBookmark }) {
  const drop = useBookmarkDropTarget("target", "Destination");
  return (
    <>
      <BookmarkDragHandle bookmark={item} />
      <div data-testid="target" onDrop={drop.onDrop} />
    </>
  );
}

beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.status = "online";
  mocks.add.mockImplementation(async () => undefined);
  mocks.remove.mockImplementation(async () => undefined);
  useBulkActionsStore.setState({
    isBulkEditEnabled: true,
    selectedBookmarkIds: ["a", "b"],
    visibleBookmarks: [bookmark("a"), bookmark("b"), bookmark("c")],
    selectionSession: 1,
  });
  useBookmarkDragStore.setState({ isDropping: false });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  await i18next.init({
    lng: "en",
    resources: { en: { translation: translations } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.bookmarkDragging;
});

describe("selection drag interaction", () => {
  it("drags selected bookmarks together and leaves only incomplete moves selected", async () => {
    mocks.remove.mockImplementation(async (input) => {
      if ((input as { bookmarkId: string }).bookmarkId === "b")
        throw new Error("failed removal");
    });
    const view = render(<Harness item={bookmark("a")} />);
    const dataTransfer = transfer();
    fireEvent.dragStart(
      view.container.querySelector("[data-bookmark-drag-handle]")!,
      { dataTransfer },
    );
    expect(getBookmarkDragData(dataTransfer)?.bookmarkIds).toEqual(["a", "b"]);
    expect(document.documentElement.dataset.bookmarkDragging).toBe("true");
    fireEvent.drop(view.getByTestId("target"), { dataTransfer });
    await waitFor(() =>
      expect(useBookmarkDragStore.getState().isDropping).toBe(false),
    );
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual(["b"]);
    expect(useBulkActionsStore.getState().isBulkEditEnabled).toBe(true);
    expect(mocks.toast.mock.calls.at(-1)?.[0].description).toContain(
      "could not remove",
    );
    expect(document.documentElement.dataset.bookmarkDragging).toBeUndefined();
  });

  it("drags an unselected bookmark alone and preserves the existing selection", async () => {
    const view = render(<Harness item={bookmark("c")} />);
    const dataTransfer = transfer();
    fireEvent.dragStart(
      view.container.querySelector("[data-bookmark-drag-handle]")!,
      { dataTransfer },
    );
    expect(getBookmarkDragData(dataTransfer)?.bookmarkIds).toEqual(["c"]);
    fireEvent.drop(view.getByTestId("target"), { dataTransfer });
    await waitFor(() =>
      expect(useBookmarkDragStore.getState().isDropping).toBe(false),
    );
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([
      "a",
      "b",
    ]);
  });

  it("blocks the entire selected drag when any bookmark belongs to someone else", () => {
    useBulkActionsStore.setState({
      visibleBookmarks: [bookmark("a"), bookmark("b", "someone-else")],
    });
    const view = render(<Harness item={bookmark("a")} />);
    const dataTransfer = transfer();
    expect(
      fireEvent.dragStart(
        view.container.querySelector("[data-bookmark-drag-handle]")!,
        { dataTransfer },
      ),
    ).toBe(false);
    expect(getBookmarkDragData(dataTransfer)).toBeNull();
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("Deselect"),
      }),
    );
  });

  it("disables offline dragging and clears the cursor on cancellation without mutations", () => {
    mocks.status = "offline";
    const view = render(<Harness item={bookmark("a")} />);
    const handle = view.container.querySelector("[data-bookmark-drag-handle]")!;
    expect(handle.getAttribute("draggable")).toBe("false");
    expect(handle.getAttribute("title")).toContain("Connect");
    mocks.status = "online";
    view.rerender(<Harness item={bookmark("a")} />);
    fireEvent.dragStart(handle, { dataTransfer: transfer() });
    fireEvent.dragEnd(handle);
    expect(document.documentElement.dataset.bookmarkDragging).toBeUndefined();
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([
      "a",
      "b",
    ]);
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
