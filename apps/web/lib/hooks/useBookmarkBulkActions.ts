"use client";

import { useCallback } from "react";

import { limitConcurrency } from "@karakeep/shared/concurrency";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  useRefreshBookmark,
  useRecrawlBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useRemoveBookmarkFromList } from "@karakeep/shared-react/hooks/lists";

const MAX_CONCURRENT_BULK_ACTIONS = 50;
export const MAX_BULK_REFRESH_BOOKMARKS = 200;

export class BulkRefreshLimitError extends Error {
  constructor() {
    super(
      `Bulk refresh is limited to ${MAX_BULK_REFRESH_BOOKMARKS} bookmarks.`,
    );
    this.name = "BulkRefreshLimitError";
  }
}

export interface UpdateBookmarkProps {
  favourited?: boolean;
  archived?: boolean;
}

export function useBookmarkBulkMutations({
  selectedBookmarks,
  selectedActionableBookmarks = () => selectedBookmarks,
  listContext,
  onError,
  onBulkEditDone,
}: {
  selectedBookmarks: ZBookmark[];
  selectedActionableBookmarks?: () => ZBookmark[];
  listContext?: ZBookmarkList;
  onError?: () => void;
  onBulkEditDone?: () => void;
}) {
  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: onBulkEditDone,
    onError,
  });
  const recrawlBookmarkMutator = useRecrawlBookmark({
    onSuccess: onBulkEditDone,
    onError,
  });
  const refreshBookmarkMutator = useRefreshBookmark({
    onSuccess: onBulkEditDone,
    onError,
  });
  const removeBookmarkFromListMutator = useRemoveBookmarkFromList({
    onSuccess: onBulkEditDone,
    onError,
  });

  const selectedLinkBookmarks = useCallback(
    () =>
      selectedBookmarks.filter(
        (bookmark) => bookmark.content.type === BookmarkTypes.LINK,
      ),
    [selectedBookmarks],
  );

  const updateSelectedBookmarks = useCallback(
    async (
      update: UpdateBookmarkProps,
      bookmarks = selectedActionableBookmarks(),
    ) => {
      if (bookmarks.length === 0) {
        return [];
      }

      return Promise.all(
        limitConcurrency(
          bookmarks.map(
            (bookmark) => () =>
              updateBookmarkMutator.mutateAsync({
                bookmarkId: bookmark.id,
                ...update,
              }),
          ),
          MAX_CONCURRENT_BULK_ACTIONS,
        ),
      );
    },
    [selectedActionableBookmarks, updateBookmarkMutator],
  );

  const setSelectedBookmarksToNextState = useCallback(
    async (field: "favourited" | "archived") => {
      const selected = selectedActionableBookmarks();
      if (selected.length === 0) {
        return [];
      }

      const shouldEnable = !selected.every((bookmark) => bookmark[field]);

      return updateSelectedBookmarks({ [field]: shouldEnable }, selected);
    },
    [selectedActionableBookmarks, updateSelectedBookmarks],
  );

  const recrawlSelectedLinkBookmarks = useCallback(
    async (archiveFullPage: boolean) => {
      const links = selectedLinkBookmarks();
      await Promise.all(
        limitConcurrency(
          links.map(
            (bookmark) => () =>
              recrawlBookmarkMutator.mutateAsync({
                bookmarkId: bookmark.id,
                archiveFullPage,
              }),
          ),
          MAX_CONCURRENT_BULK_ACTIONS,
        ),
      );
      return links;
    },
    [recrawlBookmarkMutator, selectedLinkBookmarks],
  );

  const refreshSelectedBookmarks = useCallback(async () => {
    const selected = selectedActionableBookmarks();
    if (selected.length > MAX_BULK_REFRESH_BOOKMARKS) {
      throw new BulkRefreshLimitError();
    }

    await Promise.all(
      limitConcurrency(
        selected.map(
          (bookmark) => () =>
            refreshBookmarkMutator.mutateAsync({ bookmarkId: bookmark.id }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
    return selected;
  }, [refreshBookmarkMutator, selectedActionableBookmarks]);

  const removeSelectedBookmarksFromList = useCallback(async () => {
    if (!listContext) {
      return [];
    }

    return Promise.allSettled(
      limitConcurrency(
        selectedBookmarks.map(
          (bookmark) => () =>
            removeBookmarkFromListMutator.mutateAsync({
              bookmarkId: bookmark.id,
              listId: listContext.id,
            }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
  }, [listContext, removeBookmarkFromListMutator, selectedBookmarks]);

  const selectedBookmarkLinksText = useCallback(() => {
    return selectedBookmarks
      .map((bookmark) => {
        return (
          bookmark.content.type === BookmarkTypes.LINK && bookmark.content.url
        );
      })
      .filter(Boolean)
      .join("\n");
  }, [selectedBookmarks]);

  return {
    updateBookmarkMutator,
    recrawlBookmarkMutator,
    refreshBookmarkMutator,
    removeBookmarkFromListMutator,
    updateSelectedBookmarks,
    setSelectedBookmarksToNextState,
    recrawlSelectedLinkBookmarks,
    refreshSelectedBookmarks,
    removeSelectedBookmarksFromList,
    selectedBookmarkLinksText,
  };
}
