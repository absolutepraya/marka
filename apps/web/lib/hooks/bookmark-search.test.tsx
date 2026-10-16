// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useDoBookmarkSearch, useLocalBookmarkSearch } from "./bookmark-search";

const mocks = vi.hoisted(() => ({
  liveQuerySubscribers: [] as {
    next: (value: unknown) => void;
    error: (reason: unknown) => void;
  }[],
  searchBookmarks: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/search",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("q=offline"),
}));

vi.mock("@/lib/offline-library/repository", () => ({
  searchBookmarks: mocks.searchBookmarks,
}));

vi.mock("dexie", () => ({
  liveQuery: (query: () => Promise<unknown>) => ({
    subscribe: (subscriber: {
      next: (value: unknown) => void;
      error: (reason: unknown) => void;
    }) => {
      mocks.liveQuerySubscribers.push(subscriber);
      void query().then(subscriber.next, subscriber.error);
      return {
        unsubscribe: () => {
          const index = mocks.liveQuerySubscribers.indexOf(subscriber);
          if (index >= 0) {
            mocks.liveQuerySubscribers.splice(index, 1);
          }
        },
      };
    },
  }),
}));

afterEach(() => {
  mocks.liveQuerySubscribers.length = 0;
  mocks.searchBookmarks.mockReset();
  mocks.replace.mockReset();
  vi.useRealTimers();
});

test("refreshes local search results after an optimistic replica write", async () => {
  mocks.searchBookmarks.mockResolvedValue([
    { id: "bookmark-1", title: "Before edit" } as ZBookmark,
  ]);

  const { result } = renderHook(() => useLocalBookmarkSearch());

  await waitFor(() => {
    expect(result.current.data?.pages[0]?.bookmarks[0]?.title).toBe(
      "Before edit",
    );
  });
  mocks.liveQuerySubscribers[0]?.next([
    { id: "bookmark-1", title: "Edited offline" } as ZBookmark,
  ]);

  await waitFor(() => {
    expect(result.current.data?.pages[0]?.bookmarks[0]?.title).toBe(
      "Edited offline",
    );
  });
});

test("coalesces typing and lets an explicit submit cancel older work", () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useDoBookmarkSearch());
  act(() => {
    result.current.debounceSearch("r");
    vi.advanceTimersByTime(100);
    result.current.debounceSearch("react");
    vi.advanceTimersByTime(249);
  });
  expect(mocks.replace).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
    "/dashboard/search?q=react",
    { scroll: false },
  );
  act(() => {
    result.current.debounceSearch("stale");
    result.current.doSearch("list:React");
    vi.advanceTimersByTime(500);
  });
  expect(mocks.replace).toHaveBeenCalledTimes(2);
  expect(mocks.replace).toHaveBeenLastCalledWith(
    "/dashboard/search?q=list%3AReact",
    { scroll: false },
  );
});

test("cancels pending navigation on unmount", () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useDoBookmarkSearch());
  act(() => result.current.debounceSearch("stale"));
  unmount();
  act(() => vi.advanceTimersByTime(500));
  expect(mocks.replace).not.toHaveBeenCalled();
});
