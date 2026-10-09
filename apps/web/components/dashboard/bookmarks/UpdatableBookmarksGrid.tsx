"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";
import {
  useCanReadOfflineReplica,
  useOfflineLibraryStatus,
} from "@/lib/offline-library/provider";
import {
  isOfflineReplicaReady,
  offlineLibraryDb,
  queryBookmarks,
} from "@/lib/offline-library/repository";
import type { OfflineBookmarkQuery } from "@/lib/offline-library/repository";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useInfiniteQuery } from "@tanstack/react-query";
import { liveQuery } from "dexie";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillLoading } from "@karakeep/shared/utils/bookmarkUtils";
import type { ZCursor } from "@karakeep/shared/types/pagination";
import { BookmarkGridContextProvider } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useTRPC } from "@karakeep/shared-react/trpc";

import BookmarksGrid from "./BookmarksGrid";
import OfflineLibraryUnavailable from "./OfflineLibraryUnavailable";

interface UpdatableBookmarksGridProps {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">;
  bookmarks: ZGetBookmarksResponse;
  showEditorCard?: boolean;
  itemsPerPage?: number;
}

interface LocalBookmarkPagination {
  bookmarks: ZGetBookmarksResponse["bookmarks"];
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoaded: boolean;
  isReady: boolean;
  bookmarkCount: number;
  error: Error | null;
}

function toOfflineQuery(
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">,
  sortOrder: "asc" | "desc",
): OfflineBookmarkQuery {
  return {
    archived: query.archived,
    favourited: query.favourited,
    tagId: query.tagId,
    listId: query.listId,
    rssFeedId: query.rssFeedId,
    cursor: query.cursor ?? null,
    limit: query.limit,
    sortOrder,
  };
}

function useLocalBookmarkPagination(
  query: OfflineBookmarkQuery,
  enabled: boolean,
): LocalBookmarkPagination {
  const [bookmarks, setBookmarks] = useState<
    ZGetBookmarksResponse["bookmarks"]
  >([]);
  const [nextCursor, setNextCursor] = useState<ZCursor | null>(null);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const generationRef = useRef(0);

  const {
    archived,
    favourited,
    tagId,
    listId,
    rssFeedId,
    cursor,
    limit,
    sortOrder,
  } = query;

  useEffect(() => {
    const generation = ++generationRef.current;

    if (!enabled) {
      setBookmarks([]);
      setNextCursor(null);
      setBookmarkCount(0);
      setIsLoaded(false);
      setIsReady(false);
      setError(null);
      setIsFetchingNextPage(false);
      return;
    }

    setBookmarks([]);
    setNextCursor(null);
    setBookmarkCount(0);
    setIsLoaded(false);
    setIsReady(false);
    setError(null);
    setIsFetchingNextPage(false);

    const subscription = liveQuery(
      async () =>
        await Promise.all([
          queryBookmarks({
            archived,
            favourited,
            tagId,
            listId,
            rssFeedId,
            cursor,
            limit,
            sortOrder,
          }),
          offlineLibraryDb.bookmarks.count(),
          isOfflineReplicaReady(),
        ]),
    ).subscribe({
      next: ([page, count, ready]) => {
        if (generation !== generationRef.current) {
          return;
        }
        setBookmarks(page.bookmarks);
        setNextCursor(page.nextCursor);
        setBookmarkCount(count);
        setIsReady(ready);
        setIsLoaded(true);
      },
      error: (reason: unknown) => {
        if (generation !== generationRef.current) {
          return;
        }
        setError(
          reason instanceof Error
            ? reason
            : new Error("Unable to read the offline library"),
        );
        setIsLoaded(true);
      },
    });

    return () => subscription.unsubscribe();
  }, [
    archived,
    cursor,
    enabled,
    favourited,
    limit,
    listId,
    rssFeedId,
    sortOrder,
    tagId,
  ]);

  const fetchNextPage = useCallback(async () => {
    if (!enabled || !nextCursor || isFetchingNextPage) {
      return;
    }

    const generation = generationRef.current;
    setIsFetchingNextPage(true);
    try {
      const page = await queryBookmarks({
        archived,
        favourited,
        tagId,
        listId,
        rssFeedId,
        cursor: nextCursor,
        limit,
        sortOrder,
      });
      if (generation !== generationRef.current) {
        return;
      }
      setBookmarks((currentBookmarks) => [
        ...currentBookmarks,
        ...page.bookmarks,
      ]);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      if (generation === generationRef.current) {
        setError(
          reason instanceof Error
            ? reason
            : new Error("Unable to read the offline library"),
        );
      }
    } finally {
      if (generation === generationRef.current) {
        setIsFetchingNextPage(false);
      }
    }
  }, [
    archived,
    enabled,
    favourited,
    isFetchingNextPage,
    limit,
    listId,
    nextCursor,
    sortOrder,
    rssFeedId,
    tagId,
  ]);

  return {
    bookmarks,
    hasNextPage: nextCursor !== null,
    fetchNextPage,
    isFetchingNextPage,
    isLoaded,
    isReady,
    bookmarkCount,
    error,
  };
}

function BookmarkGrid({
  bookmarks,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  showEditorCard,
}: Pick<
  LocalBookmarkPagination,
  "bookmarks" | "hasNextPage" | "fetchNextPage" | "isFetchingNextPage"
> & { showEditorCard: boolean }) {
  const grid = (
    <BookmarksGrid
      bookmarks={bookmarks}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      showEditorCard={showEditorCard}
    />
  );

  return grid;
}

function OfflineBookmarksGrid({
  query,
  showEditorCard,
  lastSyncedAt,
}: Pick<UpdatableBookmarksGridProps, "query"> & {
  showEditorCard: boolean;
  lastSyncedAt: Date | null;
}) {
  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    sortOrder = "desc";
  }
  const local = useLocalBookmarkPagination(
    toOfflineQuery(query, sortOrder),
    true,
  );

  if (local.error) {
    return <OfflineLibraryUnavailable error />;
  }
  if (lastSyncedAt === null && local.isLoaded && local.bookmarkCount === 0) {
    return <OfflineLibraryUnavailable />;
  }

  return <BookmarkGrid {...local} showEditorCard={showEditorCard} />;
}

function ServerBookmarksGrid({
  query,
  initialBookmarks,
  showEditorCard,
}: Pick<UpdatableBookmarksGridProps, "query"> & {
  initialBookmarks: ZGetBookmarksResponse;
  showEditorCard: boolean;
}) {
  const api = useTRPC();
  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    // Relevance is not supported in the `getBookmarks` endpoint.
    sortOrder = "desc";
  }

  const finalQuery = { ...query, sortOrder, includeContent: false };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery(
      api.bookmarks.getBookmarks.infiniteQueryOptions(
        { ...finalQuery, useCursorV2: true },
        {
          initialData: () => ({
            pages: [initialBookmarks],
            pageParams: [query.cursor ?? null],
          }),
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          refetchOnMount: true,
          refetchInterval: (activeQuery) =>
            activeQuery.state.data?.pages.some((page) =>
              page.bookmarks.some(isBookmarkStillLoading),
            )
              ? 1000
              : false,
        },
      ),
    );
  useEffect(() => {
    refetch();
  }, [sortOrder, refetch]);

  const serverBookmarks = data.pages.flatMap((page) => page.bookmarks);

  return (
    <BookmarkGrid
      bookmarks={serverBookmarks}
      hasNextPage={hasNextPage ?? false}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage ?? false}
      showEditorCard={showEditorCard}
    />
  );
}

export default function UpdatableBookmarksGrid({
  query,
  bookmarks: initialBookmarks,
  showEditorCard = false,
}: UpdatableBookmarksGridProps) {
  const status = useOfflineLibraryStatus();
  const canReadOfflineReplica = useCanReadOfflineReplica();
  const browserIsOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  let content: ReactNode;

  if (status.kind === "offline" || browserIsOffline) {
    content = canReadOfflineReplica ? (
      <OfflineBookmarksGrid
        query={query}
        showEditorCard={showEditorCard}
        lastSyncedAt={status.kind === "offline" ? status.lastSyncedAt : null}
      />
    ) : (
      <BookmarksGridSkeleton />
    );
  } else {
    content = (
      <ServerBookmarksGrid
        query={query}
        initialBookmarks={initialBookmarks}
        showEditorCard={showEditorCard}
      />
    );
  }

  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    sortOrder = "desc";
  }
  const finalQuery = { ...query, sortOrder, includeContent: false };

  return (
    <BookmarkGridContextProvider query={finalQuery}>
      {content}
    </BookmarkGridContextProvider>
  );
}
