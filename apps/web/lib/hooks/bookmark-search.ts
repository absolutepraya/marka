import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { searchBookmarks } from "@/lib/offline-library/repository";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { liveQuery } from "dexie";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import { useInSearchPageStore } from "../store/useInSearchPageStore";

export function useSearchQuery() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const pathname = usePathname();
  const lastQuery = useRef(searchQuery);

  const effectiveQuery = pathname.startsWith("/dashboard/search")
    ? searchQuery
    : lastQuery.current;

  // Keep the most recent search query while an intercepting route changes the
  // URL away from the search page.
  useEffect(() => {
    if (pathname.startsWith("/dashboard/search")) {
      lastQuery.current = searchQuery;
    }
  }, [pathname, searchQuery]);

  const parsed = useMemo(
    () => parseSearchQuery(effectiveQuery),
    [effectiveQuery],
  );
  return { searchQuery: effectiveQuery, parsedSearchQuery: parsed };
}

export function useDoBookmarkSearch() {
  const router = useRouter();
  const { searchQuery, parsedSearchQuery } = useSearchQuery();
  const isInSearchPage = useInSearchPageStore((val) => val.inSearchPage);
  const timeoutId = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutId.current ?? undefined);
    };
  }, [timeoutId]);

  const cancelSearch = useCallback(() => {
    clearTimeout(timeoutId.current ?? undefined);
    timeoutId.current = null;
  }, []);

  const doSearch = useCallback(
    (val: string) => {
      cancelSearch();
      router.replace(`/dashboard/search?q=${encodeURIComponent(val)}`, {
        scroll: false,
      });
    },
    [cancelSearch, router],
  );

  const debounceSearch = useCallback(
    (val: string) => {
      cancelSearch();
      timeoutId.current = setTimeout(() => doSearch(val), 250);
    },
    [cancelSearch, doSearch],
  );

  return {
    doSearch,
    debounceSearch,
    cancelSearch,
    searchQuery,
    parsedSearchQuery,
    isInSearchPage,
  };
}

export function useLocalBookmarkSearch() {
  const { searchQuery } = useSearchQuery();
  const [localBookmarks, setLocalBookmarks] = useState<ZBookmark[] | null>(
    null,
  );
  const [localError, setLocalError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLocalBookmarks(null);
    setLocalError(null);
    const subscription = liveQuery(
      async () => await searchBookmarks(searchQuery),
    ).subscribe({
      next: (bookmarks) => {
        if (!cancelled) {
          setLocalBookmarks(bookmarks);
        }
      },
      error: (reason: unknown) => {
        if (!cancelled) {
          setLocalError(
            reason instanceof Error
              ? reason
              : new Error("Unable to search the offline library"),
          );
        }
      },
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchQuery]);

  if (localError) {
    throw localError;
  }

  return {
    data:
      localBookmarks === null
        ? undefined
        : { pages: [{ bookmarks: localBookmarks }] },
    hasNextPage: false,
    fetchNextPage: () => Promise.resolve(),
    isFetchingNextPage: false,
  };
}

export function useServerBookmarkSearch() {
  const api = useTRPC();
  const { searchQuery } = useSearchQuery();
  const sortOrder = useSortOrderStore((state) => state.sortOrder);
  const { data, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      api.bookmarks.searchBookmarks.infiniteQueryOptions(
        {
          text: searchQuery,
          sortOrder,
        },
        {
          placeholderData: keepPreviousData,
          gcTime: 60_000,
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      ),
    );

  if (error) {
    throw error;
  }

  return {
    data,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  };
}
