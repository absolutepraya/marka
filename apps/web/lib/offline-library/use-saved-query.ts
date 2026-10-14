"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/client";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

import { useCanReadOfflineReplica } from "./provider";
import { isOfflineReplicaReady } from "./repository";
import { readSavedQuery, writeSavedQuery } from "./saved-queries";

export function useSavedQuery<T>(
  queryKey: QueryKey,
  {
    enabled = true,
    readReplica,
  }: {
    enabled?: boolean;
    readReplica?: () => Promise<T | undefined>;
  } = {},
) {
  const client = useQueryClient();
  const canRead = useCanReadOfflineReplica();
  const { data: session } = useSession();
  const owner = session?.user?.id;
  const hash = hashKey(queryKey);
  const latestKey = useRef(queryKey);
  useEffect(() => {
    latestKey.current = queryKey;
  }, [queryKey]);

  useEffect(() => {
    if (!enabled || !canRead || !owner) return;
    const key = latestKey.current;
    let cancelled = false;
    const persist = (data: unknown) => {
      void writeSavedQuery(owner, hash, data).catch(() => undefined);
    };
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== hash) return;
      if (event.action.type === "invalidate") {
        cancelled = true;
        persist(undefined);
      }
      if (event.action.type === "success" && !event.action.manual)
        persist(event.query.state.data);
    });
    const current = client.getQueryState(key);
    if (
      current?.data !== undefined &&
      current.dataUpdatedAt > 0 &&
      !current.isInvalidated
    )
      persist(current.data);
    if (current?.data === undefined) {
      void (async () => {
        try {
          const saved = await readSavedQuery<T>(owner, hash);
          const data =
            saved ??
            (readReplica && (await isOfflineReplicaReady())
              ? await readReplica()
              : undefined);
          if (!cancelled && data !== undefined) {
            client.setQueryData<T>(
              key,
              (existing) => (existing === undefined ? data : undefined),
              { updatedAt: 0 },
            );
          }
        } catch {
          // Saved data is optional; the active server query remains the fallback.
        }
      })();
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, canRead, owner, hash, enabled, readReplica]);
}

// Keep invalidations effective while a saved screen is unmounted, such as when
// a tag is deleted from a bookmark or a list is edited on another page.
export function SavedQueryInvalidationListener() {
  const client = useQueryClient();
  const canRead = useCanReadOfflineReplica();
  const { data: session } = useSession();
  const owner = session?.user?.id;
  useEffect(() => {
    if (!canRead || !owner) return;
    return client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "invalidate") {
        void writeSavedQuery(owner, event.query.queryHash, undefined).catch(
          () => undefined,
        );
      }
    });
  }, [client, canRead, owner]);
  return null;
}
