// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZGetBookmarksResponse } from "@karakeep/shared/types/bookmarks";
import type { OfflineLibraryStatus } from "@/lib/offline-library/sync";

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

const mocks = vi.hoisted(() => ({
  status: {
    kind: "offline",
    lastSyncedAt: new Date(),
    pendingWrites: 0,
  } as OfflineLibraryStatus,
  queryBookmarks: vi.fn(),
  countBookmarks: vi.fn(),
  isOfflineReplicaReady: vi.fn(),
  canReadOfflineReplica: true,
  getBookmarks: vi.fn(),
  liveQuerySubscribers: [] as {
    next: (value: unknown) => void;
    error: (reason: unknown) => void;
  }[],
  useInfiniteQuery: vi.fn(),
}));

vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => mocks.status,
  useCanReadOfflineReplica: () => mocks.canReadOfflineReplica,
}));

vi.mock("@/lib/offline-library/repository", () => ({
  queryBookmarks: mocks.queryBookmarks,
  isOfflineReplicaReady: mocks.isOfflineReplicaReady,
  offlineLibraryDb: {
    bookmarks: { count: mocks.countBookmarks },
  },
}));
vi.mock("@/lib/store/useSortOrderStore", () => ({
  useSortOrderStore: () => "desc",
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: mocks.useInfiniteQuery,
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

vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    bookmarks: {
      getBookmarks: {
        infiniteQueryOptions: mocks.getBookmarks,
      },
    },
  }),
}));

vi.mock("@karakeep/shared-react/hooks/bookmark-grid-context", () => ({
  BookmarkGridContextProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("./BookmarksGridSkeleton", () => ({
  default: () => <div>Loading offline library</div>,
}));

vi.mock("./BookmarksGrid", () => ({
  default: ({
    bookmarks,
    fetchNextPage,
  }: {
    bookmarks: { id: string; title?: string | null }[];
    fetchNextPage: () => void;
  }) => (
    <div>
      {bookmarks.map((bookmark) => (
        <span key={bookmark.id}>{bookmark.title ?? bookmark.id}</span>
      ))}
      <button type="button" onClick={fetchNextPage}>
        Load more
      </button>
    </div>
  ),
}));
import UpdatableBookmarksGrid from "./UpdatableBookmarksGrid";

const serverPage = {
  bookmarks: [],
  nextCursor: null,
} as ZGetBookmarksResponse;

afterEach(() => {
  cleanup();
  mocks.status = {
    kind: "offline",
    lastSyncedAt: new Date(),
    pendingWrites: 0,
  };
  mocks.queryBookmarks.mockReset();
  mocks.countBookmarks.mockReset();
  mocks.isOfflineReplicaReady.mockReset();
  mocks.canReadOfflineReplica = true;
  mocks.getBookmarks.mockReset();
  mocks.liveQuerySubscribers.length = 0;
  mocks.useInfiniteQuery.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("UpdatableBookmarksGrid", () => {
  it("renders the local replica while offline instead of calling getBookmarks", async () => {
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [{ id: "cached-bookmark" }],
      cursor: "1",
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(1);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    expect(await screen.findByText("cached-bookmark")).toBeTruthy();
    expect(mocks.getBookmarks).not.toHaveBeenCalled();
  });

  it("passes an RSS feed page's query to the offline replica", async () => {
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [{ id: "feed-bookmark" }],
      cursor: "1",
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(2);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);

    render(
      <UpdatableBookmarksGrid
        query={{ rssFeedId: "feed-1" }}
        bookmarks={serverPage}
      />,
    );

    expect(await screen.findByText("feed-bookmark")).toBeTruthy();
    expect(mocks.queryBookmarks).toHaveBeenCalledWith(
      expect.objectContaining({ rssFeedId: "feed-1" }),
    );
  });

  it("refreshes the offline grid when an optimistic replica write completes", async () => {
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [{ id: "bookmark-1", title: "Before edit" }],
      cursor: "1",
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(1);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    expect(await screen.findByText("Before edit")).toBeTruthy();
    mocks.liveQuerySubscribers[0]?.next([
      {
        bookmarks: [{ id: "bookmark-1", title: "Edited offline" }],
        cursor: "1",
        nextCursor: null,
      },
      1,
      true,
    ]);

    expect(await screen.findByText("Edited offline")).toBeTruthy();
    expect(screen.queryByText("Before edit")).toBeNull();
  });

  it("uses the local unavailable state for a cold offline launch before constructing a server query", async () => {
    mocks.status = { kind: "initializing" };
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [],
      cursor: null,
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(0);
    mocks.isOfflineReplicaReady.mockResolvedValue(false);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    expect(
      await screen.findByText(/offline library has not been downloaded/i),
    ).toBeTruthy();
    expect(mocks.getBookmarks).not.toHaveBeenCalled();
  });

  it("ignores a superseded local next page and keeps the new query cursor", async () => {
    const oldNextPage = Promise.withResolvers<{
      bookmarks: { id: string }[];
      cursor: string | null;
      nextCursor: { id: string; createdAt: Date } | null;
    }>();

    mocks.queryBookmarks.mockImplementation((query) => {
      if (query.archived === false && query.cursor === null) {
        return Promise.resolve({
          bookmarks: [{ id: "old-first" }],
          cursor: null,
          nextCursor: { id: "old-next", createdAt: new Date(1) },
        });
      }
      if (query.archived === false) {
        return oldNextPage.promise;
      }
      if (query.archived === true && query.cursor === null) {
        return Promise.resolve({
          bookmarks: [{ id: "new-first" }],
          cursor: null,
          nextCursor: { id: "new-next", createdAt: new Date(2) },
        });
      }
      return Promise.resolve({
        bookmarks: [{ id: "new-second" }],
        cursor: null,
        nextCursor: null,
      });
    });
    mocks.countBookmarks.mockResolvedValue(1);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);

    const view = render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );
    expect(await screen.findByText("old-first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    view.rerender(
      <UpdatableBookmarksGrid
        query={{ archived: true }}
        bookmarks={serverPage}
      />,
    );
    expect(await screen.findByText("new-first")).toBeTruthy();
    oldNextPage.resolve({
      bookmarks: [{ id: "old-second" }],
      cursor: null,
      nextCursor: null,
    });
    await waitFor(() => expect(screen.queryByText("old-second")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("new-second")).toBeTruthy();
    expect(mocks.queryBookmarks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        archived: true,
        cursor: { id: "new-next", createdAt: new Date(2) },
      }),
    );
  });

  it("retains SSR bookmarks while an empty local replica awaits online refresh", async () => {
    mocks.status = {
      kind: "online",
      lastSyncedAt: new Date(),
      pendingWrites: 0,
    };
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [],
      cursor: null,
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(0);
    mocks.isOfflineReplicaReady.mockResolvedValue(false);
    mocks.useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            bookmarks: [{ id: "server-bookmark" }],
            nextCursor: null,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchedAfterMount: false,
      refetch: vi.fn(),
    });

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    expect(await screen.findByText("server-bookmark")).toBeTruthy();
  });

  it("keeps fresh SSR bookmarks visible without reading a local replica during revalidation", async () => {
    mocks.status = {
      kind: "online",
      lastSyncedAt: new Date(),
      pendingWrites: 0,
    };
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [{ id: "stale-on-phone" }],
      cursor: "1",
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(1);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);
    mocks.useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            bookmarks: [{ id: "saved-on-pc" }],
            nextCursor: null,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchedAfterMount: false,
      refetch: vi.fn(),
    });

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    expect(screen.getByText("saved-on-pc")).toBeTruthy();

    await waitFor(() => expect(mocks.queryBookmarks).not.toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText("saved-on-pc")).toBeTruthy();
      expect(screen.queryByText("stale-on-phone")).toBeNull();
    });
  });

  it("does not read an initializing replica over SSR bookmarks", async () => {
    mocks.status = { kind: "initializing" };
    mocks.queryBookmarks.mockResolvedValue({
      bookmarks: [{ id: "stale-on-phone" }],
      cursor: "1",
      nextCursor: null,
    });
    mocks.countBookmarks.mockResolvedValue(1);
    mocks.isOfflineReplicaReady.mockResolvedValue(true);
    mocks.useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            bookmarks: [{ id: "saved-on-pc" }],
            nextCursor: null,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    });

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={
          {
            bookmarks: [{ id: "saved-on-pc" }],
            nextCursor: null,
          } as ZGetBookmarksResponse
        }
      />,
    );

    expect(screen.getByText("saved-on-pc")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("saved-on-pc")).toBeTruthy();
      expect(screen.queryByText("stale-on-phone")).toBeNull();
      expect(mocks.queryBookmarks).not.toHaveBeenCalled();
    });
  });

  it("does not read an offline replica until its ownership is verified", async () => {
    mocks.status = {
      kind: "offline",
      lastSyncedAt: new Date(),
      pendingWrites: 0,
    };
    mocks.canReadOfflineReplica = false;

    render(
      <UpdatableBookmarksGrid
        query={{ archived: false }}
        bookmarks={serverPage}
      />,
    );

    await waitFor(() => expect(mocks.queryBookmarks).not.toHaveBeenCalled());
    expect(mocks.getBookmarks).not.toHaveBeenCalled();
  });
});
