import superjson from "superjson";

import { getReplicaOwnerUserId, offlineLibraryDb } from "./repository";

const PREFIX = "savedQuery:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 32;

export async function readSavedQuery<T>(
  owner: string,
  hash: string,
): Promise<T | undefined> {
  return offlineLibraryDb.transaction(
    "r",
    offlineLibraryDb.metadata,
    async () => {
      if ((await getReplicaOwnerUserId()) !== owner) return undefined;
      const row = await offlineLibraryDb.metadata.get(PREFIX + hash);
      if (!row) return undefined;
      const saved = superjson.parse<{
        owner: string;
        savedAt: number;
        data: T;
      }>(row.value);
      if (saved.owner !== owner || Date.now() - saved.savedAt > MAX_AGE_MS)
        return undefined;
      return saved.data;
    },
  );
}

export async function writeSavedQuery(
  owner: string,
  hash: string,
  data: unknown,
): Promise<void> {
  await offlineLibraryDb.transaction(
    "rw",
    offlineLibraryDb.metadata,
    async () => {
      if ((await getReplicaOwnerUserId()) !== owner) return;
      if (data === undefined) {
        await offlineLibraryDb.metadata.delete(PREFIX + hash);
        return;
      }
      // Persist one page per query. Live memory caches can keep all loaded pages.
      const savedData =
        data &&
        typeof data === "object" &&
        "pages" in data &&
        "pageParams" in data
          ? {
              ...data,
              pages: (data.pages as unknown[]).slice(0, 1),
              pageParams: (data.pageParams as unknown[]).slice(0, 1),
            }
          : data;
      await offlineLibraryDb.metadata.put({
        key: PREFIX + hash,
        value: superjson.stringify({
          owner,
          savedAt: Date.now(),
          data: savedData,
        }),
      });
      const rows = await offlineLibraryDb.metadata
        .where("key")
        .startsWith(PREFIX)
        .toArray();
      if (rows.length > MAX_SNAPSHOTS) {
        rows.sort(
          (a, b) =>
            superjson.parse<{ savedAt: number }>(a.value).savedAt -
            superjson.parse<{ savedAt: number }>(b.value).savedAt,
        );
        await offlineLibraryDb.metadata.bulkDelete(
          rows.slice(0, rows.length - MAX_SNAPSHOTS).map((row) => row.key),
        );
      }
    },
  );
}
