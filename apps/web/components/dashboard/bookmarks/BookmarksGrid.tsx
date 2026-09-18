import { memo, useEffect, useMemo, useState } from "react";
import KeyboardShortcutsDialog from "@/components/dashboard/KeyboardShortcutsDialog";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import useBulkActionsStore from "@/lib/bulkActions";
import { useBookmarkKeyboardNavigation } from "@/lib/hooks/useBookmarkKeyboardNavigation";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n/client";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import usePendingBookmarkDeletionStore from "@/lib/store/usePendingBookmarkDeletionStore";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { SCREENS } from "@/lib/breakpoints";
import { useServerIsMobile } from "@/lib/serverHints";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { ErrorBoundary } from "react-error-boundary";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";

import BookmarkCard from "./BookmarkCard";
import EditorCard from "./EditorCard";
import UnknownCard from "./UnknownCard";

function StyledBookmarkCard({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Slot
      className={cn(
        "shadow-xs ease-(--ease-out) mb-1 overflow-hidden rounded-xl border border-border/80 bg-card transition-[border-color,box-shadow,background-color] duration-200 hover:border-border hover:shadow-md sm:mb-3 sm:rounded-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </Slot>
  );
}

const BookmarkGridItem = memo(function BookmarkGridItem({
  bookmark,
  index,
}: {
  bookmark: ZBookmark;
  index: number;
}) {
  const isFocused = useKeyboardNavigationStore(
    (state) => state.isNavigating && state.focusedIndex === index,
  );

  return (
    <ErrorBoundary fallback={<UnknownCard bookmark={bookmark} />}>
      <StyledBookmarkCard
        className={cn(
          isFocused &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <BookmarkCard bookmark={bookmark} bookmarkIndex={index} />
      </StyledBookmarkCard>
    </ErrorBoundary>
  );
});

function getBreakpointConfig(userColumns: number, isMobile: boolean) {
  const phoneColumns = Math.max(1, Math.min(userColumns, 2));
  const breakpointColumnsObj: { [key: number]: number; default: number } = {
    // `default` is what react-masonry-css renders before it can measure the
    // viewport — i.e. the server-rendered first paint. On phones the server
    // can't know the width, so seed it with the phone column count to avoid a
    // 3->2 column flash on load; the client still measures and adjusts below.
    default: isMobile ? phoneColumns : userColumns,
  };

  // Responsive behavior: reduce columns on smaller screens. Phones keep up to
  // 2 columns (instead of collapsing to 1) so masonry stays two-up by default.
  const lgColumns = Math.max(1, Math.min(userColumns, userColumns - 1));
  const mdColumns = phoneColumns;
  const smColumns = phoneColumns;

  breakpointColumnsObj[SCREENS.lg] = lgColumns;
  breakpointColumnsObj[SCREENS.md] = mdColumns;
  breakpointColumnsObj[SCREENS.sm] = smColumns;
  return breakpointColumnsObj;
}

function getColumnsForViewport(userColumns: number, viewportWidth: number) {
  const { sm, md, lg } = SCREENS;

  if (viewportWidth <= sm) {
    return Math.max(1, Math.min(userColumns, 2));
  }
  if (viewportWidth <= md) {
    return Math.max(1, Math.min(userColumns, 2));
  }
  if (viewportWidth <= lg) {
    return Math.max(1, userColumns - 1);
  }
  return userColumns;
}

function useActiveGridColumns(userColumns: number) {
  const [activeColumns, setActiveColumns] = useState(userColumns);

  useEffect(() => {
    let animationFrame: number | null = null;
    const updateActiveColumns = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        setActiveColumns(getColumnsForViewport(userColumns, window.innerWidth));
      });
    };

    const updateActiveColumnsImmediately = () => {
      setActiveColumns(getColumnsForViewport(userColumns, window.innerWidth));
    };

    updateActiveColumnsImmediately();
    window.addEventListener("resize", updateActiveColumns);
    return () => {
      window.removeEventListener("resize", updateActiveColumns);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [userColumns]);

  return activeColumns;
}

export default function BookmarksGrid({
  bookmarks,
  hasNextPage = false,
  fetchNextPage = () => ({}),
  isFetchingNextPage = false,
  showEditorCard = false,
}: {
  bookmarks: ZBookmark[];
  showEditorCard?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}) {
  const { t } = useTranslation();
  const layout = useBookmarkLayout();
  const gridColumns = useGridColumns();
  const serverIsMobile = useServerIsMobile();
  const clientIsMobile = useIsMobile();
  const isMobile = serverIsMobile || clientIsMobile;
  const activeGridColumns = useActiveGridColumns(gridColumns);
  const setVisibleBookmarks = useBulkActionsStore(
    (state) => state.setVisibleBookmarks,
  );
  const setListContext = useBulkActionsStore((state) => state.setListContext);
  const setInBookmarkGrid = useInBookmarkGridStore(
    (state) => state.setInBookmarkGrid,
  );
  const withinListContext = useBookmarkListContext();
  const pendingBookmarkIds = usePendingBookmarkDeletionStore(
    (state) => state.pendingBookmarkIds,
  );
  const visibleBookmarks = useMemo(() => {
    if (pendingBookmarkIds.length === 0) {
      return bookmarks;
    }

    const pendingBookmarkIdSet = new Set(pendingBookmarkIds);
    return bookmarks.filter(
      (bookmark) => !pendingBookmarkIdSet.has(bookmark.id),
    );
  }, [bookmarks, pendingBookmarkIds]);
  const breakpointConfig = useMemo(
    () => getBreakpointConfig(gridColumns, serverIsMobile),
    [gridColumns, serverIsMobile],
  );
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();

  // For list/compact layouts, navigation is single-column
  const isListLayout = layout === "list" || layout === "compact";
  const navColumns = isListLayout ? 1 : activeGridColumns;

  const {
    helpDialogOpen,
    setHelpDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    isBulkDelete,
    deleteCount,
    confirmDelete,
    isDeletePending,
  } = useBookmarkKeyboardNavigation({
    bookmarks: visibleBookmarks,
    columns: navColumns,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  useEffect(() => {
    setVisibleBookmarks(visibleBookmarks);
    setListContext(withinListContext);

    return () => {
      setVisibleBookmarks([]);
      setListContext(undefined);
    };
  }, [
    setListContext,
    setVisibleBookmarks,
    visibleBookmarks,
    withinListContext,
  ]);

  useEffect(() => {
    setInBookmarkGrid(true);
    return () => {
      setInBookmarkGrid(false);
    };
  }, [setInBookmarkGrid]);

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadMoreButtonInView]);

  if (visibleBookmarks.length == 0 && !showEditorCard) {
    return (
      <>
        <NoBookmarksBanner />
        <KeyboardShortcutsDialog
          open={helpDialogOpen}
          setOpen={setHelpDialogOpen}
        />
      </>
    );
  }

  const children = [
    showEditorCard && !isMobile && (
      // The mobile nav has its own + button + capture modal. Do not pass a
      // hidden editor card into Masonry on phones: it still consumes the
      // first column slot and makes the first bookmark start on the right.
      <div key={"editor"}>
        <StyledBookmarkCard>
          <EditorCard />
        </StyledBookmarkCard>
      </div>
    ),
    ...visibleBookmarks.map((bookmark, index) => (
      <BookmarkGridItem key={bookmark.id} bookmark={bookmark} index={index} />
    )),
  ];
  return (
    <>
      {visibleBookmarks.length === 0 && showEditorCard && (
        <NoBookmarksBanner className="mb-4" />
      )}
      {bookmarkLayoutSwitch(layout, {
        masonry: (
          <Masonry
            className="-ml-2 flex w-auto sm:-ml-3"
            columnClassName="pl-2 sm:pl-3"
            breakpointCols={breakpointConfig}
          >
            {children}
          </Masonry>
        ),
        grid: (
          <Masonry
            className="-ml-2 flex w-auto sm:-ml-3"
            columnClassName="pl-2 sm:pl-3"
            breakpointCols={breakpointConfig}
          >
            {children}
          </Masonry>
        ),
        list: <div className="grid grid-cols-1">{children}</div>,
        compact: <div className="grid grid-cols-1">{children}</div>,
      })}
      {hasNextPage && (
        <div className="flex justify-center">
          <ActionButton
            ref={loadMoreRef}
            ignoreDemoMode={true}
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            variant="ghost"
          >
            Load More
          </ActionButton>
        </div>
      )}

      <KeyboardShortcutsDialog
        open={helpDialogOpen}
        setOpen={setHelpDialogOpen}
      />

      <ActionConfirmingDialog
        open={deleteDialogOpen}
        setOpen={setDeleteDialogOpen}
        title={t("dialogs.bookmarks.delete_confirmation_title")}
        description={
          isBulkDelete
            ? t("dialogs.bookmarks.bulk_delete_confirmation_description", {
                count: deleteCount,
              })
            : t("dialogs.bookmarks.delete_confirmation_description")
        }
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={isDeletePending}
            onClick={confirmDelete}
          >
            {t("actions.delete")}
          </ActionButton>
        )}
      />
    </>
  );
}
