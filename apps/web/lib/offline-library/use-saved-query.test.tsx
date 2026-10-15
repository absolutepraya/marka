// @vitest-environment jsdom
import "fake-indexeddb/auto";

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  hashKey,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { offlineLibraryDb } from "./repository";
import * as storage from "./saved-queries";
import {
  SavedQueryInvalidationListener,
  useSavedQuery,
} from "./use-saved-query";

const mocks = vi.hoisted(() => ({ canRead: true, owner: "user-1" }));
vi.mock("./provider", () => ({
  useCanReadOfflineReplica: () => mocks.canRead,
}));
vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: { user: { id: mocks.owner } } }),
}));
const key = ["tags", "unused"];
function deferred<T>() {
  let resolve!: (data: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
let client: QueryClient;
let response: ReturnType<typeof deferred<string>>;
function Screen({
  readReplica,
}: {
  readReplica?: () => Promise<string | undefined>;
}) {
  useSavedQuery<string>(key, { readReplica });
  const { data } = useQuery({ queryKey: key, queryFn: () => response.promise });
  return <output>{data ?? "Loading"}</output>;
}
function mount(readReplica?: () => Promise<string | undefined>) {
  return render(
    <QueryClientProvider client={client}>
      <Screen readReplica={readReplica} />
    </QueryClientProvider>,
  );
}
beforeEach(async () => {
  await offlineLibraryDb.delete();
  await offlineLibraryDb.open();
  await offlineLibraryDb.metadata.bulkPut([
    { key: "replicaOwnerUserId", value: "user-1" },
    { key: "replicaState", value: "ready" },
  ]);
  mocks.canRead = true;
  mocks.owner = "user-1";
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  response = deferred<string>();
});
afterEach(async () => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  await offlineLibraryDb.delete();
});

test("shows saved server results while refreshing, then persists updated counts", async () => {
  await storage.writeSavedQuery("user-1", hashKey(key), "Unused tags: 3");
  mount();
  expect(await screen.findByText("Unused tags: 3")).toBeTruthy();
  expect(client.getQueryState(key)?.dataUpdatedAt).toBe(0);
  await act(async () => {
    response.resolve("Unused tags: 2");
  });
  expect(await screen.findByText("Unused tags: 2")).toBeTruthy();
  await waitFor(async () =>
    expect(await storage.readSavedQuery("user-1", hashKey(key))).toBe(
      "Unused tags: 2",
    ),
  );
});

test("a late stored result cannot replace a newer server response", async () => {
  const saved = deferred<string>();
  vi.spyOn(storage, "readSavedQuery").mockImplementation(
    () => saved.promise as never,
  );
  mount();
  await act(async () => {
    response.resolve("Fresh name");
  });
  expect(await screen.findByText("Fresh name")).toBeTruthy();
  const timestamp = client.getQueryState(key)?.dataUpdatedAt;
  await act(async () => {
    saved.resolve("Old name");
  });
  expect(screen.getByText("Fresh name")).toBeTruthy();
  expect(client.getQueryState(key)?.dataUpdatedAt).toBe(timestamp);
});

test("an invalidation prevents a pending saved read from resurrecting deleted data", async () => {
  const saved = deferred<string>();
  vi.spyOn(storage, "readSavedQuery").mockImplementation(
    () => saved.promise as never,
  );
  mount();
  await act(async () => {
    void client.invalidateQueries({ queryKey: key });
  });
  await act(async () => {
    saved.resolve("Deleted tag");
  });
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(client.getQueryData(key)).toBeUndefined();
});

test("does not seed cached data after replica access is revoked", async () => {
  const saved = deferred<string>();
  vi.spyOn(storage, "readSavedQuery").mockImplementation(
    () => saved.promise as never,
  );
  const view = mount();
  mocks.canRead = false;
  view.rerender(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>,
  );
  await act(async () => {
    saved.resolve("Previous account");
  });
  expect(client.getQueryData(key)).toBeUndefined();
});

test("uses a complete local replica when no saved screen exists", async () => {
  const read = vi.fn().mockResolvedValue("Local folder");
  mount(read);
  expect(await screen.findByText("Local folder")).toBeTruthy();
});

test("does not show an incomplete replica as an empty result", async () => {
  await offlineLibraryDb.metadata.put({ key: "replicaState", value: "stale" });
  const read = vi.fn().mockResolvedValue("Incomplete folder");
  mount(read);
  await act(async () => {
    response.resolve("Server folder");
  });
  expect(await screen.findByText("Server folder")).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
});

test("falls back to the server when IndexedDB is unavailable", async () => {
  vi.spyOn(storage, "readSavedQuery").mockRejectedValue(
    new Error("Storage unavailable"),
  );
  mount();
  await act(async () => {
    response.resolve("Server result");
  });
  expect(await screen.findByText("Server result")).toBeTruthy();
});

test("deleting from another page invalidates the persisted screen even while it is unmounted", async () => {
  await storage.writeSavedQuery("user-1", hashKey(key), "Deleted elsewhere");
  client.setQueryData(key, "Deleted elsewhere");
  render(
    <QueryClientProvider client={client}>
      <SavedQueryInvalidationListener />
    </QueryClientProvider>,
  );
  await client.invalidateQueries({ queryKey: key, refetchType: "none" });
  await waitFor(async () =>
    expect(
      await storage.readSavedQuery("user-1", hashKey(key)),
    ).toBeUndefined(),
  );
});
