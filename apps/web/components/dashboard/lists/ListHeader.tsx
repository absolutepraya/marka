"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { EditingButton } from "@/components/ui/editing-button";
import { useTranslation } from "@/lib/i18n/client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Sparkles } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

import QueryExplainerTooltip from "../search/QueryExplainerTooltip";
import ListBreadcrumbs from "./ListBreadcrumbs";
import { ListSwitcher, SublistNavigation } from "./ListNavigation";
import { ListOptions } from "./ListOptions";
import {
  ListCollaboratorsIcons,
  ListPrivacyLabel,
} from "./ListHeaderComponents";

export default function ListHeader({
  initialData,
}: {
  initialData: ZBookmarkList;
}) {
  const api = useTRPC();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data: list, error } = useQuery(
    api.lists.get.queryOptions(
      {
        listId: initialData.id,
      },
      {
        initialData,
      },
    ),
  );
  const {
    data: listsData,
    isPending: listsPending,
    error: listsError,
    refetch: refetchLists,
  } = useBookmarkLists();

  const { data: statsData } = useQuery(
    api.lists.stats.queryOptions(undefined, {
      placeholderData: keepPreviousData,
    }),
  );
  const itemCount = statsData?.stats.get(list.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [list.id]);
  const hierarchyPath = listsData?.getPathById(list.id) ?? [list];
  const children = useMemo(
    () =>
      (listsData?.data ?? [])
        .filter((candidate) => candidate.parentId === list.id)
        .sort((a, b) => a.name.localeCompare(b.name, i18n.resolvedLanguage)),
    [listsData, list, i18n.resolvedLanguage],
  );

  const parsedQuery = useMemo(() => {
    if (!list.query) {
      return null;
    }
    return parseSearchQuery(list.query);
  }, [list.query]);

  if (error) {
    // This is usually exercised during list deletions.
    if (error.data?.code == "NOT_FOUND") {
      router.push("/dashboard/lists");
    }
  }

  return (
    <div className="space-y-4">
      <ListBreadcrumbs key={`breadcrumb-${list.id}`} path={hierarchyPath} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center text-[1.75rem] sm:size-10 sm:text-4xl">
            {list.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="scroll-mt-20 break-words text-[1.75rem] font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl"
            >
              {list.name}
            </h1>
            {list.description && (
              <p className="mt-1 text-muted-foreground">{list.description}</p>
            )}
            {parsedQuery && (
              <div className="mt-1 text-xs text-muted-foreground">
                <QueryExplainerTooltip
                  parsedSearchQuery={parsedQuery}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex cursor-help items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <Sparkles className="size-3.5" />
                      {t("lists.smart_list")}
                    </button>
                  }
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-1 text-end text-xs text-muted-foreground">
          {itemCount !== undefined && (
            <span className="tabular-nums">
              {t("lists.items_count", { count: itemCount })}
            </span>
          )}
          <ListPrivacyLabel list={list} className="justify-end" />
          <ListCollaboratorsIcons list={list} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ListSwitcher key={list.id} />
        <div className="flex min-w-0 items-center justify-end gap-1">
          <GlobalActions />
          <ListOptions list={list}>
            <EditingButton tooltip={t("actions.more")} ignoreDemoMode>
              <MoreHorizontal />
            </EditingButton>
          </ListOptions>
        </div>
      </div>
      {listsError ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <p>{t("lists.navigation.load_error")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetchLists()}
          >
            {t("startup.retry")}
          </Button>
        </div>
      ) : listsPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("lists.navigation.loading")}
        </p>
      ) : null}
      <SublistNavigation key={`sublists-${list.id}`} lists={children} />
    </div>
  );
}
