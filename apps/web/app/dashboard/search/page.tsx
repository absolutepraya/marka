"use client";

import React, { Suspense, useEffect } from "react";
import GlobalActions from "@/components/dashboard/GlobalActions";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";
import {
  useLocalBookmarkSearch,
  useServerBookmarkSearch,
} from "@/lib/hooks/bookmark-search";
import {
  useCanReadOfflineReplica,
  useOfflineLibraryStatus,
} from "@/lib/offline-library/provider";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";

function OfflineSearchResults() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useLocalBookmarkSearch();

  return (
    <div className="flex flex-col gap-3">
      {data ? (
        <BookmarksGrid
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          bookmarks={data.pages.flatMap((page) => page.bookmarks)}
        />
      ) : (
        <BookmarksGridSkeleton />
      )}
    </div>
  );
}

function OnlineSearchResults() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useServerBookmarkSearch();

  return (
    <div className="flex flex-col gap-3">
      {data ? (
        <BookmarksGrid
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          bookmarks={data.pages.flatMap((page) => page.bookmarks)}
        />
      ) : (
        <BookmarksGridSkeleton />
      )}
    </div>
  );
}

function SearchResults() {
  const status = useOfflineLibraryStatus();
  const canReadOfflineReplica = useCanReadOfflineReplica();
  const browserIsOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (status.kind === "offline" || browserIsOffline) {
    return canReadOfflineReplica ? (
      <OfflineSearchResults />
    ) : (
      <div className="flex flex-col gap-3">
        <BookmarksGridSkeleton />
      </div>
    );
  }

  return <OnlineSearchResults />;
}

function SearchComp() {
  const { setInSearchPage } = useInSearchPageStore();

  const { setSortOrder } = useSortOrderStore();

  useEffect(() => {
    // also see related cleanup code in SortOrderToggle.tsx
    setSortOrder("relevance");
  }, []);

  useEffect(() => {
    setInSearchPage(true);
    return () => setInSearchPage(false);
  }, [setInSearchPage]);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <GlobalActions />
      </div>
      <SearchResults />
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchComp />
    </Suspense>
  );
}
