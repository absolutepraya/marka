import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/ui/sonner";
import {
  BOOKMARK_DRAG_MIME,
  BOOKMARK_SOURCE_LIST_MIME,
  dropBookmarks,
  getBookmarkDragData,
} from "@/lib/bookmark-drag";
import useBulkActionsStore from "@/lib/bulkActions";
import { useTranslation } from "@/lib/i18n/client";
import { useOfflineLibraryStatus } from "@/lib/offline-library/provider";
import { useBookmarkDragStore } from "@/lib/store/useBookmarkDragStore";

import {
  useAddBookmarkToList,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";

export function useBookmarkDropTarget(listId: string, listName: string) {
  // Fail an interrupted online drop rather than silently queuing it offline.
  const { mutateAsync: addToList } = useAddBookmarkToList({
    networkMode: "always",
    retry: false,
  });
  const { mutateAsync: removeFromList } = useRemoveBookmarkFromList({
    networkMode: "always",
    retry: false,
  });
  const status = useOfflineLibraryStatus();
  const { t } = useTranslation();
  const [dropHighlight, setDropHighlight] = useState(false);
  const dragCounter = useRef(0);

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(BOOKMARK_DRAG_MIME)) return;
      if (
        status.kind !== "online" ||
        useBookmarkDragStore.getState().isDropping
      ) {
        event.dataTransfer.dropEffect = "none";
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
        BOOKMARK_SOURCE_LIST_MIME,
      )
        ? "move"
        : "copy";
    },
    [status.kind],
  );

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (
        status.kind === "online" &&
        !useBookmarkDragStore.getState().isDropping &&
        event.dataTransfer.types.includes(BOOKMARK_DRAG_MIME)
      ) {
        event.preventDefault();
        dragCounter.current++;
        setDropHighlight(true);
      }
    },
    [status.kind],
  );

  const onDragLeave = useCallback(() => {
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDropHighlight(false);
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      dragCounter.current = 0;
      setDropHighlight(false);
      delete document.documentElement.dataset.bookmarkDragging;
      const data = getBookmarkDragData(event.dataTransfer);
      if (!data) return;
      event.preventDefault();
      if (data.sourceListId === listId) return;
      if (
        status.kind !== "online" ||
        useBookmarkDragStore.getState().isDropping
      ) {
        toast({
          variant: "destructive",
          description: t(
            status.kind !== "online" ? "lists.drag.offline" : "lists.drag.busy",
          ),
        });
        return;
      }
      useBookmarkDragStore.setState({ isDropping: true });
      try {
        const result = await dropBookmarks({
          ...data,
          targetListId: listId,
          addToList,
          removeFromList,
        });
        if (!result) return;
        if (data.selectionSession !== undefined) {
          useBulkActionsStore
            .getState()
            .completeBookmarkDrag(result.completedIds, data.selectionSession);
        }
        const incomplete = result.addedOnlyIds.length + result.failedIds.length;
        const description = [
          result.completedIds.length > 0 &&
            t(result.isMove ? "lists.drag.moved" : "lists.drag.added", {
              count: result.completedIds.length,
              list: listName,
            }),
          result.addedOnlyIds.length > 0 &&
            t("lists.drag.added_only", {
              count: result.addedOnlyIds.length,
              list: listName,
            }),
          result.failedIds.length > 0 &&
            t("lists.drag.failed", { count: result.failedIds.length }),
          incomplete > 0 && t("lists.drag.retry"),
        ]
          .filter(Boolean)
          .join(" ");
        toast({
          description,
          variant: incomplete > 0 ? "destructive" : "default",
        });
      } finally {
        useBookmarkDragStore.setState({ isDropping: false });
      }
    },
    [listId, listName, status.kind, addToList, removeFromList, t],
  );

  return { dropHighlight, onDragOver, onDragEnter, onDragLeave, onDrop };
}
