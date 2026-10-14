// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canRead: true,
  ready: vi.fn(),
  local: vi.fn(),
  server: vi.fn(),
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({ kind: "initializing" }),
  useCanReadOfflineReplica: () => mocks.canRead,
}));
vi.mock("@/lib/offline-library/repository", () => ({
  isOfflineReplicaReady: mocks.ready,
  queryBookmarks: mocks.local,
  offlineLibraryDb: {},
}));
vi.mock("@/lib/store/useSortOrderStore", () => ({
  useSortOrderStore: () => "desc",
}));
const api = {
  bookmarks: {
    getBookmarks: {
      infiniteQueryOptions: (
        input: { archived: boolean },
        options: object,
      ) => ({
        ...options,
        queryKey: ["bookmarks", input.archived],
        queryFn: () => mocks.server(),
      }),
    },
  },
};
vi.mock("@karakeep/shared-react/trpc", () => ({ useTRPC: () => api }));
vi.mock("@karakeep/shared-react/hooks/bookmark-grid-context", () => ({
  BookmarkGridContextProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("./BookmarksGridSkeleton", () => ({
  default: () => <div>Loading</div>,
}));
vi.mock("./BookmarksGrid", () => ({
  default: ({ bookmarks }: { bookmarks: { id: string; title: string }[] }) => (
    <div>
      {bookmarks.length
        ? bookmarks.map((b) => <span key={b.id}>{b.title}</span>)
        : "Empty library"}
    </div>
  ),
}));

vi.mock("@/lib/offline-library/use-saved-query", () => ({
  useSavedQuery: vi.fn(),
}));

import UpdatableBookmarksGrid from "./UpdatableBookmarksGrid";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const page = (title: string) => ({
  bookmarks: [{ id: title, title, content: { type: "text", text: title } }],
  nextCursor: null,
});
let client: QueryClient;
let server: ReturnType<typeof deferred<ReturnType<typeof page>>>;
function renderGrid(archived = false) {
  return render(
    <QueryClientProvider client={client}>
      <UpdatableBookmarksGrid query={{ archived }} preferLocalData />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  server = deferred();
  mocks.canRead = true;
  mocks.ready.mockResolvedValue(true);
  mocks.local.mockResolvedValue(page("Saved locally"));
  mocks.server.mockImplementation(() => server.promise);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
});

describe("Home and Archive local first rendering", () => {
  it("shows saved cards before the network response, then reconciles edits, additions and deletions", async () => {
    mocks.local.mockResolvedValue({
      bookmarks: [
        { ...page("Before edit").bookmarks[0], id: "edited" },
        { ...page("Deleted bookmark").bookmarks[0], id: "deleted" },
      ],
      nextCursor: null,
    });
    renderGrid();
    expect(await screen.findByText("Before edit")).toBeTruthy();
    expect(screen.getByText("Deleted bookmark")).toBeTruthy();
    expect(mocks.server).toHaveBeenCalledOnce();
    expect(client.getQueryState(["bookmarks", false])?.dataUpdatedAt).toBe(0);
    await act(async () => {
      server.resolve({
        bookmarks: [
          { ...page("After edit").bookmarks[0], id: "edited" },
          { ...page("New bookmark").bookmarks[0], id: "created" },
        ],
        nextCursor: null,
      });
    });
    expect(await screen.findByText("After edit")).toBeTruthy();
    expect(screen.getByText("New bookmark")).toBeTruthy();
    expect(screen.queryByText("Before edit")).toBeNull();
    expect(screen.queryByText("Deleted bookmark")).toBeNull();
  });

  it("never replaces a server response that wins the race against IndexedDB", async () => {
    const local = deferred<ReturnType<typeof page>>();
    mocks.local.mockReturnValue(local.promise);
    renderGrid();
    await waitFor(() => expect(mocks.local).toHaveBeenCalled());
    await act(async () => {
      server.resolve(page("Server won"));
    });
    expect(await screen.findByText("Server won")).toBeTruthy();
    const updatedAt = client.getQueryState(["bookmarks", false])?.dataUpdatedAt;
    await act(async () => {
      local.resolve(page("Older local copy"));
    });
    expect(screen.getByText("Server won")).toBeTruthy();
    expect(screen.queryByText("Older local copy")).toBeNull();
    expect(client.getQueryState(["bookmarks", false])?.dataUpdatedAt).toBe(
      updatedAt,
    );
  });

  it("keeps all cached pages on return and avoids a local scan or fresh request", async () => {
    client.setQueryData(["bookmarks", false], {
      pages: [page("First page"), page("Second page")],
      pageParams: [null, null],
    });
    renderGrid();
    expect(screen.getByText("First page")).toBeTruthy();
    expect(screen.getByText("Second page")).toBeTruthy();
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("does not read an unverified user's replica", async () => {
    mocks.canRead = false;
    renderGrid();
    await act(async () => {
      server.resolve(page("Signed in user's server data"));
    });
    expect(
      await screen.findByText("Signed in user's server data"),
    ).toBeTruthy();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("uses the server when the first local snapshot is incomplete", async () => {
    mocks.ready.mockResolvedValue(false);
    renderGrid();
    await act(async () => {
      server.resolve(page("First server page"));
    });
    expect(await screen.findByText("First server page")).toBeTruthy();
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("uses the server when local storage cannot be read", async () => {
    mocks.local.mockRejectedValue(new Error("IndexedDB unavailable"));
    renderGrid();
    await waitFor(() => expect(mocks.local).toHaveBeenCalled());
    await act(async () => {
      server.resolve(page("Server fallback"));
    });
    expect(await screen.findByText("Server fallback")).toBeTruthy();
  });

  it("does not treat smart list membership as its server-computed result", async () => {
    render(
      <QueryClientProvider client={client}>
        <UpdatableBookmarksGrid
          query={{ listId: "smart-list" }}
          preferLocalData
          allowLocalReplica={false}
        />
      </QueryClientProvider>,
    );
    await act(async () => {
      server.resolve(page("Server-computed match"));
    });
    expect(await screen.findByText("Server-computed match")).toBeTruthy();
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("reads Archive's filter and accepts a verified empty library", async () => {
    mocks.local.mockResolvedValue({ bookmarks: [], nextCursor: null });
    renderGrid(true);
    expect(await screen.findByText("Empty library")).toBeTruthy();
    expect(mocks.local).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true, sortOrder: "desc" }),
    );
  });

  it("does not seed a late local read after account access is revoked", async () => {
    const local = deferred<ReturnType<typeof page>>();
    mocks.local.mockReturnValue(local.promise);
    const view = renderGrid();
    await waitFor(() => expect(mocks.local).toHaveBeenCalled());
    mocks.canRead = false;
    view.rerender(
      <QueryClientProvider client={client}>
        <UpdatableBookmarksGrid query={{ archived: false }} preferLocalData />
      </QueryClientProvider>,
    );
    await act(async () => {
      local.resolve(page("Previous user's local cards"));
    });
    expect(client.getQueryData(["bookmarks", false])).toBeUndefined();
    expect(screen.queryByText("Previous user's local cards")).toBeNull();
  });
});
