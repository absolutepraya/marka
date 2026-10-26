"use client";

import React, { useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/lists.bones.json";
import { useTranslation } from "@/lib/i18n/client";
import { offlineLibraryDb } from "@/lib/offline-library/repository";
import { useSavedQuery } from "@/lib/offline-library/use-saved-query";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import AllListsView from "./AllListsView";
import { PendingInvitationsCard } from "./PendingInvitationsCard";

export default function ListsPageContent() {
  const api = useTRPC();
  const { t } = useTranslation();
  const listsOptions = api.lists.list.queryOptions();
  const statsOptions = api.users.stats.queryOptions();
  const listStatsOptions = api.lists.stats.queryOptions();
  const readLists = useCallback(
    async () => ({ lists: await offlineLibraryDb.lists.toArray() }),
    [],
  );
  useSavedQuery(listsOptions.queryKey, { readReplica: readLists });
  useSavedQuery(statsOptions.queryKey);
  useSavedQuery(listStatsOptions.queryKey);
  const { data: lists, error } = useQuery(listsOptions);
  const { data: stats } = useQuery(statsOptions);
  if (error && !lists) throw error;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("lists.all_lists")}
        icon={<ClipboardList />}
        titleAction={
          lists && (
            <div className="flex flex-col items-end text-right text-xs leading-4 text-muted-foreground">
              <span>
                {t("lists.summary_list", { count: lists.lists.length })}
              </span>
              {stats && (
                <span>
                  {t("lists.summary_bookmark", { count: stats.numBookmarks })}
                </span>
              )}
            </div>
          )
        }
      />
      <PendingInvitationsCard />
      {lists ? (
        <AllListsView
          initialData={lists.lists}
          archivedCount={stats?.numArchived}
          favoritesCount={stats?.numFavorites}
        />
      ) : (
        <CapturedSkeleton name="lists" bones={bones} />
      )}
    </div>
  );
}
