// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";

import useBulkActionsStore from "@/lib/bulkActions";
import BulkBookmarksAction from "./BulkBookmarksAction";

const mocks = vi.hoisted(() => ({ pathname: "/dashboard/bookmarks" }));
vi.mock("./bookmarks/icons", () => ({
  FavouritedActionIcon: () => null,
  ArchivedActionIcon: () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: { user: { id: "owner" } } }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/ui/action-button", () => ({
  ActionButton: () => null,
  ActionButtonWithTooltip: ({
    children,
    loading: _loading,
    tooltip: _tooltip,
    delayDuration: _delayDuration,
    ...props
  }: React.ComponentProps<"button"> & {
    loading?: boolean;
    tooltip?: string;
    delayDuration?: number;
  }) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/action-confirming-dialog", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/hooks/useUndoableBookmarkDeletion", () => ({
  useUndoableBookmarkDeletion: () => ({
    scheduleDeletes: vi.fn(),
    pendingBookmarkIds: [],
  }),
}));
vi.mock("@/lib/hooks/useBookmarkBulkActions", () => ({
  BulkRefreshLimitError: class extends Error {},
  MAX_BULK_REFRESH_BOOKMARKS: 200,
  useBookmarkBulkMutations: () => ({
    updateBookmarkMutator: {},
    recrawlBookmarkMutator: {},
    refreshBookmarkMutator: {},
    removeBookmarkFromListMutator: {},
  }),
}));
vi.mock("./bookmarks/BulkTagModal", () => ({
  default: () => <div>Tag editor mounted</div>,
}));
vi.mock("./bookmarks/BulkManageListsModal", () => ({
  default: () => <div>List editor mounted</div>,
}));

const bookmark = (id: string, userId: string) =>
  ({
    id,
    userId,
    content: { type: "link", url: "https://example.com" },
  }) as ZBookmark;

describe("bulk bookmark controls across collections", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard/bookmarks";
    useBulkActionsStore.setState({
      isBulkEditEnabled: false,
      selectedBookmarkIds: [],
      visibleBookmarks: [
        bookmark("owned", "owner"),
        bookmark("shared", "other"),
      ],
      listContext: undefined,
    });
  });
  afterEach(cleanup);

  it("selects only owned bookmarks in a mixed shared collection", () => {
    render(<BulkBookmarksAction />);
    fireEvent.click(screen.getByRole("button", { name: "actions.bulk_edit" }));
    fireEvent.click(screen.getByRole("button", { name: "actions.select_all" }));
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([
      "owned",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: "actions.unselect_all" }),
    );
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([]);
  });

  it("disables bulk entry when no owned bookmark is available", () => {
    useBulkActionsStore.setState({
      visibleBookmarks: [bookmark("shared", "other")],
    });
    render(<BulkBookmarksAction />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "actions.bulk_edit",
      }).disabled,
    ).toBe(true);
  });

  it.each(["owner", "editor", "viewer"] as const)(
    "respects %s permissions for manual-folder removal",
    (userRole) => {
      useBulkActionsStore.setState({
        isBulkEditEnabled: true,
        listContext: {
          id: "folder",
          type: "manual",
          userRole,
        } as ZBookmarkList,
      });
      render(<BulkBookmarksAction />);
      expect(
        Boolean(
          screen.queryByRole("button", { name: "actions.remove_from_list" }),
        ),
      ).toBe(userRole !== "viewer");
    },
  );

  it("clears selection when navigating to a different folder", () => {
    useBulkActionsStore.setState({
      isBulkEditEnabled: true,
      selectedBookmarkIds: ["owned"],
    });
    const view = render(<BulkBookmarksAction />);
    mocks.pathname = "/dashboard/lists/web-store";
    view.rerender(<BulkBookmarksAction />);
    expect(useBulkActionsStore.getState().isBulkEditEnabled).toBe(false);
    expect(useBulkActionsStore.getState().selectedBookmarkIds).toEqual([]);
  });

  it("mounts bulk editors only when opened", () => {
    useBulkActionsStore.setState({
      isBulkEditEnabled: true,
      selectedBookmarkIds: ["owned"],
    });
    render(<BulkBookmarksAction />);
    expect(screen.queryByText("Tag editor mounted")).toBeNull();
    expect(screen.queryByText("List editor mounted")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "actions.edit_tags" }));
    expect(screen.getByText("Tag editor mounted")).toBeTruthy();
  });
});
