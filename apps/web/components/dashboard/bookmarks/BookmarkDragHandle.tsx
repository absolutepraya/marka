"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/sonner";
import { useSession } from "@/lib/auth/client";
import { setBookmarkDragData } from "@/lib/bookmark-drag";
import useBulkActionsStore from "@/lib/bulkActions";
import { useTranslation } from "@/lib/i18n/client";
import { useOfflineLibraryStatus } from "@/lib/offline-library/provider";
import { useBookmarkDragStore } from "@/lib/store/useBookmarkDragStore";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

export function BookmarkDragHandle({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const status = useOfflineLibraryStatus();
  const isDropping = useBookmarkDragStore((state) => state.isDropping);
  const bulkEnabled = useBulkActionsStore((state) => state.isBulkEditEnabled);
  const listContext = useBookmarkListContext();
  const dragging = useRef(false);
  const reason =
    status.kind !== "online"
      ? t("lists.drag.offline")
      : isDropping
        ? t("lists.drag.busy")
        : bookmark.userId !== session?.user?.id
          ? t("lists.drag.not_owned")
          : undefined;

  function endDrag() {
    if (dragging.current) {
      delete document.documentElement.dataset.bookmarkDragging;
      dragging.current = false;
    }
  }
  useEffect(
    () => () => {
      if (dragging.current)
        delete document.documentElement.dataset.bookmarkDragging;
    },
    [],
  );

  function startDrag(event: React.DragEvent) {
    event.stopPropagation();
    const state = useBulkActionsStore.getState();
    const selected =
      state.isBulkEditEnabled && state.isBookmarkSelected(bookmark.id);
    const bookmarks = selected ? state.getSelectedBookmarks() : [bookmark];
    const error =
      reason ??
      (bookmarks.some((item) => item.userId !== session?.user?.id)
        ? t("lists.drag.not_owned")
        : undefined);
    if (
      error ||
      bookmarks.length === 0 ||
      useBookmarkDragStore.getState().isDropping
    ) {
      event.preventDefault();
      toast({
        variant: "destructive",
        description: error ?? t("lists.drag.busy"),
      });
      return;
    }
    setBookmarkDragData(
      event.dataTransfer,
      bookmarks.map((item) => item.id),
      listContext,
      selected ? state.selectionSession : undefined,
    );
    dragging.current = true;
    document.documentElement.dataset.bookmarkDragging = "true";

    const pill = document.createElement("div");
    const title = getBookmarkTitle(bookmark) ?? t("lists.drag.untitled");
    pill.textContent =
      bookmarks.length > 1
        ? t("lists.drag.preview", { count: bookmarks.length })
        : title;
    Object.assign(pill.style, {
      position: "fixed",
      left: "-9999px",
      top: "-9999px",
      padding: "6px 12px",
      borderRadius: "8px",
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      boxShadow: "var(--elevation-overlay)",
      fontSize: "13px",
      fontFamily: "inherit",
      color: "var(--foreground)",
      maxWidth: "240px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    document.body.appendChild(pill);
    event.dataTransfer.setDragImage(pill, 0, 0);
    requestAnimationFrame(() => pill.remove());
  }

  return (
    <button
      type="button"
      data-bookmark-drag-handle
      draggable={!reason}
      aria-label={t("lists.drag.handle")}
      aria-disabled={!!reason}
      title={reason ?? t("lists.drag.handle")}
      onDragStart={startDrag}
      onDragEnd={endDrag}
      onClick={(event) => {
        event.stopPropagation();
        toast({ description: reason ?? t("lists.drag.hint") });
      }}
      className={cn(
        "absolute z-[60] hidden size-8 cursor-grab items-center justify-center rounded-md bg-background/80 shadow-sm transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:fine)]:flex",
        bulkEnabled ? "opacity-100" : "opacity-0",
        reason && "cursor-not-allowed text-muted-foreground",
        className,
      )}
    >
      <GripVertical className="size-5 text-muted-foreground" />
    </button>
  );
}
