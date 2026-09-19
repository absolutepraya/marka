// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineLibraryStatus } from "@/lib/offline-library/sync";

import {
  useOfflineSafeBookmarkListMembership,
  useOfflineSafeBookmarkDeletion,
  useOfflineSafeBookmarkTags,
  useOfflineSafeBookmarkUpdate,
} from "./useOfflineSafeBookmarkMutation";

const mocks = vi.hoisted(() => ({
  getBookmark: vi.fn(),
  getList: vi.fn(),
  getBookmarkFieldVersion: vi.fn(),
  onlineUpdateMutateAsync: vi.fn(),
  onlineTagsMutateAsync: vi.fn(),
  queueBookmarkTags: vi.fn(),
  queueBookmarkListMembership: vi.fn(),
  queueBookmarkDelete: vi.fn(),
  queueBookmarkUpdate: vi.fn(),
  onlineAddToListMutateAsync: vi.fn(),
  onlineRemoveFromListMutateAsync: vi.fn(),
  onlineDeleteMutateAsync: vi.fn(),
  status: null as unknown as OfflineLibraryStatus,
}));

vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibrary: () => ({
    status: mocks.status,
    queueBookmarkUpdate: mocks.queueBookmarkUpdate,
    queueBookmarkTags: mocks.queueBookmarkTags,
    queueBookmarkListMembership: mocks.queueBookmarkListMembership,
    queueBookmarkDelete: mocks.queueBookmarkDelete,
  }),
}));

vi.mock("@/lib/offline-library/repository", () => ({
  getBookmarkFieldVersion: mocks.getBookmarkFieldVersion,
  offlineLibraryDb: {
    bookmarks: { get: mocks.getBookmark },
    lists: { get: mocks.getList },
  },
}));

vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useAddBookmarkToList: () => ({
    mutateAsync: mocks.onlineAddToListMutateAsync,
    isPending: false,
    error: null,
  }),
  useRemoveBookmarkFromList: () => ({
    mutateAsync: mocks.onlineRemoveFromListMutateAsync,
    isPending: false,
    error: null,
  }),
}));

vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useUpdateBookmark: () => ({
    mutateAsync: mocks.onlineUpdateMutateAsync,
    isPending: false,
    error: null,
  }),
  useUpdateBookmarkTags: () => ({
    mutateAsync: mocks.onlineTagsMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteBookmark: () => ({
    mutateAsync: mocks.onlineDeleteMutateAsync,
    isPending: false,
    error: null,
  }),
}));

function mockOfflineStatus() {
  mocks.status = {
    kind: "offline",
    lastSyncedAt: new Date(),
    pendingWrites: 0,
  };
}

function mockOnlineStatus() {
  mocks.status = {
    kind: "online",
    lastSyncedAt: new Date(),
    pendingWrites: 0,
  };
}

describe("useOfflineSafeBookmarkMutation", () => {
  beforeEach(() => {
    mockOfflineStatus();
    mocks.getBookmark.mockReset();
    mocks.getList.mockReset();
    mocks.getBookmarkFieldVersion.mockReset();
    mocks.onlineUpdateMutateAsync.mockReset();
    mocks.onlineTagsMutateAsync.mockReset();
    mocks.queueBookmarkUpdate.mockReset();
    mocks.queueBookmarkTags.mockReset();
    mocks.queueBookmarkListMembership.mockReset();
    mocks.queueBookmarkDelete.mockReset();
    mocks.onlineAddToListMutateAsync.mockReset();
    mocks.onlineRemoveFromListMutateAsync.mockReset();
    mocks.onlineDeleteMutateAsync.mockReset();
    mocks.getBookmarkFieldVersion.mockResolvedValue(4);
    mocks.queueBookmarkUpdate.mockResolvedValue(undefined);
    mocks.queueBookmarkTags.mockResolvedValue(undefined);
    mocks.queueBookmarkListMembership.mockResolvedValue(undefined);
    mocks.queueBookmarkDelete.mockResolvedValue(undefined);
    mocks.getList.mockResolvedValue({
      id: "list-1",
      type: "manual",
      userRole: "owner",
    });
  });

  it("queues a favourite toggle offline with the replica field version", async () => {
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await act(async () => {
      await result.current.mutateAsync({ bookmarkId: "b1", favourited: true });
    });

    expect(mocks.queueBookmarkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        kind: "bookmark.update",
        fields: { favourited: true },
        baseVersions: { favourited: 4 },
      }),
    );
    expect(mocks.onlineUpdateMutateAsync).not.toHaveBeenCalled();
  });

  it("preserves an explicit text base version when queuing offline", async () => {
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        text: "Draft text",
        textBaseVersion: 2,
      });
    });

    expect(mocks.queueBookmarkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        fields: { text: "Draft text" },
        baseVersions: { text: 2 },
      }),
    );
    expect(mocks.getBookmarkFieldVersion).not.toHaveBeenCalledWith(
      "b1",
      "text",
    );
  });

  it("requires verified replica field versions before queuing offline", async () => {
    mocks.getBookmarkFieldVersion.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await expect(
      result.current.mutateAsync({ bookmarkId: "b1", archived: true }),
    ).rejects.toThrow("requires an internet connection");

    expect(mocks.queueBookmarkUpdate).not.toHaveBeenCalled();
  });

  it("does not queue a multi-field update when any field version is absent", async () => {
    mocks.getBookmarkFieldVersion.mockImplementation(
      async (_bookmarkId, field) => (field === "note" ? undefined : 4),
    );
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await expect(
      result.current.mutateAsync({
        bookmarkId: "b1",
        archived: true,
        note: "Keep for later",
      }),
    ).rejects.toThrow("requires an internet connection");

    expect(mocks.queueBookmarkUpdate).not.toHaveBeenCalled();
  });

  it("rejects a mixed offline update instead of discarding its unsupported field", async () => {
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await expect(
      result.current.mutateAsync({
        bookmarkId: "b1",
        title: "Keep this title",
        createdAt: new Date("2026-07-13T00:00:00Z"),
      }),
    ).rejects.toThrow("requires an internet connection");

    expect(mocks.queueBookmarkUpdate).not.toHaveBeenCalled();
  });

  it("uses the existing online mutation when connectivity is verified", async () => {
    mockOnlineStatus();
    mocks.onlineUpdateMutateAsync.mockResolvedValue({ id: "b1" });
    const { result } = renderHook(() => useOfflineSafeBookmarkUpdate());

    await act(async () => {
      await result.current.mutateAsync({ bookmarkId: "b1", archived: true });
    });

    expect(mocks.onlineUpdateMutateAsync).toHaveBeenCalledWith({
      bookmarkId: "b1",
      archived: true,
    });
    expect(mocks.queueBookmarkUpdate).not.toHaveBeenCalled();
  });

  it("queues known tag replacements offline", async () => {
    mocks.getBookmark.mockResolvedValue({
      id: "b1",
      tags: [{ id: "tag-1", name: "Existing", attachedBy: "human" }],
    });
    mocks.getBookmarkFieldVersion.mockResolvedValue(3);
    const { result } = renderHook(() => useOfflineSafeBookmarkTags());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        attach: [{ tagId: "tag-2", tagName: "Added" }],
        detach: [],
      });
    });

    expect(mocks.queueBookmarkTags).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        kind: "bookmark.tags",
        tagIds: ["tag-1", "tag-2"],
        baseVersions: { tags: 3 },
      }),
    );
  });

  it("creates and attaches a new tag offline with a client-generated ID", async () => {
    mocks.getBookmark.mockResolvedValue({ id: "b1", tags: [] });
    const { result } = renderHook(() => useOfflineSafeBookmarkTags());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        attach: [{ tagName: "Offline Tag" }],
        detach: [],
      });
    });

    expect(mocks.queueBookmarkTags).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        kind: "bookmark.tags",
        tagIds: [expect.any(String)],
        createdTags: [
          {
            id: expect.any(String),
            name: "Offline Tag",
          },
        ],
      }),
    );
    const mutation = mocks.queueBookmarkTags.mock.calls[0]?.[0];
    expect(mutation.tagIds).toEqual([mutation.createdTags[0].id]);
  });

  it("keeps created tag IDs aligned when an existing tag is attached too", async () => {
    mocks.getBookmark.mockResolvedValue({ id: "b1", tags: [] });
    const { result } = renderHook(() => useOfflineSafeBookmarkTags());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        attach: [
          { tagId: "existing-tag", tagName: "Existing" },
          { tagName: "Offline Tag" },
        ],
        detach: [],
      });
    });

    const mutation = mocks.queueBookmarkTags.mock.calls[0]?.[0];
    expect(mutation.tagIds).toEqual([
      "existing-tag",
      mutation.createdTags[0].id,
    ]);
    expect(mutation.createdTags).toEqual([
      { id: mutation.createdTags[0].id, name: "Offline Tag" },
    ]);
  });

  it("serializes rapid offline tag attaches into one composed local and outbox tag set", async () => {
    let resolveFirstQueue!: () => void;
    const firstQueue = new Promise<void>((resolve) => {
      resolveFirstQueue = resolve;
    });
    let localBookmark = {
      id: "b1",
      tags: [{ id: "tag-1", name: "Existing", attachedBy: "human" }],
    };
    let outbox = {
      tagIds: [] as string[],
      baseVersions: { tags: -1 },
    };
    let queueCount = 0;
    mocks.getBookmark.mockImplementation(async () => localBookmark);
    mocks.getBookmarkFieldVersion.mockResolvedValue(3);
    mocks.queueBookmarkTags.mockImplementation(
      async (mutation: {
        tagIds: string[];
        baseVersions: { tags: number };
      }) => {
        queueCount += 1;
        if (queueCount === 1) {
          await firstQueue;
        }
        localBookmark = {
          ...localBookmark,
          tags: mutation.tagIds.map((id) => ({
            id,
            name: id,
            attachedBy: "human" as const,
          })),
        };
        outbox = {
          tagIds: mutation.tagIds,
          baseVersions:
            outbox.baseVersions.tags === -1
              ? mutation.baseVersions
              : outbox.baseVersions,
        };
      },
    );
    const { result } = renderHook(() => useOfflineSafeBookmarkTags());

    let firstAttach!: Promise<unknown | { kind: "queued" }>;
    act(() => {
      firstAttach = result.current.mutateAsync({
        bookmarkId: "b1",
        attach: [{ tagId: "tag-2", tagName: "First" }],
        detach: [],
      });
    });
    await waitFor(() =>
      expect(mocks.queueBookmarkTags).toHaveBeenCalledTimes(1),
    );

    let secondAttach!: Promise<unknown | { kind: "queued" }>;
    act(() => {
      secondAttach = result.current.mutateAsync({
        bookmarkId: "b1",
        attach: [{ tagId: "tag-3", tagName: "Second" }],
        detach: [],
      });
    });
    expect(mocks.queueBookmarkTags).toHaveBeenCalledTimes(1);

    resolveFirstQueue();
    await act(async () => {
      await Promise.all([firstAttach, secondAttach]);
    });

    expect(localBookmark.tags.map((tag) => tag.id)).toEqual([
      "tag-1",
      "tag-2",
      "tag-3",
    ]);
    expect(outbox).toEqual({
      tagIds: ["tag-1", "tag-2", "tag-3"],
      baseVersions: { tags: 3 },
    });
  });

  it("queues an existing-list membership change offline", async () => {
    mocks.getBookmark.mockResolvedValue({ id: "b1" });
    const { result } = renderHook(() => useOfflineSafeBookmarkListMembership());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        listId: "list-1",
        action: "add",
      });
    });

    expect(mocks.queueBookmarkListMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        listId: "list-1",
        action: "add",
        kind: "bookmark.listMembership",
      }),
    );
  });

  it("uses the matching online list mutation when connected", async () => {
    mockOnlineStatus();
    mocks.onlineRemoveFromListMutateAsync.mockResolvedValue({});
    const { result } = renderHook(() => useOfflineSafeBookmarkListMembership());

    await act(async () => {
      await result.current.mutateAsync({
        bookmarkId: "b1",
        listId: "list-1",
        action: "remove",
      });
    });

    expect(mocks.onlineRemoveFromListMutateAsync).toHaveBeenCalledWith({
      bookmarkId: "b1",
      listId: "list-1",
    });
    expect(mocks.queueBookmarkListMembership).not.toHaveBeenCalled();
  });

  it("queues a locally replicated owned bookmark deletion offline", async () => {
    mocks.getBookmark.mockResolvedValue({ id: "b1", userId: "user-1" });
    const { result } = renderHook(() => useOfflineSafeBookmarkDeletion());

    await act(async () => {
      await result.current.mutateAsync({ bookmarkId: "b1" });
    });

    expect(mocks.queueBookmarkDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "b1",
        kind: "bookmark.delete",
      }),
    );
  });

  it("uses the online bookmark delete mutation when connected", async () => {
    mockOnlineStatus();
    mocks.onlineDeleteMutateAsync.mockResolvedValue({});
    const { result } = renderHook(() => useOfflineSafeBookmarkDeletion());

    await act(async () => {
      await result.current.mutateAsync({ bookmarkId: "b1" });
    });

    expect(mocks.onlineDeleteMutateAsync).toHaveBeenCalledWith({
      bookmarkId: "b1",
    });
    expect(mocks.queueBookmarkDelete).not.toHaveBeenCalled();
  });
});
