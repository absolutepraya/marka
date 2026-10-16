"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/client";
import { offlineLibraryDb } from "@/lib/offline-library/schema";
import { liveQuery } from "dexie";
import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { SublistNavigation } from "../lists/ListNavigation";

export function matchSearchLists(lists: ZBookmarkList[], text: string) {
  const words = text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return lists
    .filter((list) =>
      words.every((word) => list.name.toLocaleLowerCase().includes(word)),
    )
    .sort((a, b) => {
      const name = text.trim().toLocaleLowerCase();
      const rank = (list: ZBookmarkList) =>
        list.name.toLocaleLowerCase() === name
          ? 0
          : list.name.toLocaleLowerCase().startsWith(name)
            ? 1
            : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
}

function ListMatches({
  lists,
  text,
}: {
  lists: ZBookmarkList[];
  text: string;
}) {
  const { t } = useTranslation();
  const matches = useMemo(() => matchSearchLists(lists, text), [lists, text]);
  const byId = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists],
  );
  if (!matches.length) return null;
  return (
    <div className="mb-4 rounded-xl border bg-card p-3">
      <SublistNavigation
        key={text}
        heading={t("search.lists")}
        searchResults
        lists={matches}
        getDescription={(list) => {
          const path: string[] = [];
          const seen = new Set([list.id]);
          let parentId = list.parentId;
          while (parentId && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = byId.get(parentId);
            if (!parent) break;
            path.unshift(parent.name);
            parentId = parent.parentId;
          }
          return path.length ? path.join(" / ") : undefined;
        }}
      />
    </div>
  );
}

export function OnlineSearchListResults({ text }: { text: string }) {
  const { data } = useBookmarkLists();
  return <ListMatches lists={data?.data ?? []} text={text} />;
}

export function OfflineSearchListResults({ text }: { text: string }) {
  const [lists, setLists] = useState<ZBookmarkList[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() =>
      offlineLibraryDb.lists.toArray(),
    ).subscribe({
      next: setLists,
      error: () => setLists([]),
    });
    return () => subscription.unsubscribe();
  }, []);
  return <ListMatches lists={lists} text={text} />;
}
