"use client";

import React, { useEffect } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditingButton } from "@/components/ui/editing-button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import Spinner from "@/components/ui/spinner";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { useTranslation } from "@/lib/i18n/client";
import { ArrowDownAZ, Combine, Search, SearchX, Tag } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

import type { ZGetTagResponse } from "@karakeep/shared/types/tags";
import { useDeleteUnusedTags } from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";

import { useSavedTags } from "./useSavedTags";
import BulkTagAction from "./BulkTagAction";
import { CreateTagModal } from "./CreateTagModal";
import { MultiTagSelector } from "./MultiTagSelector";
import { TagPill } from "./TagPill";

function DeleteAllUnusedTags({ numUnusedTags }: { numUnusedTags: number }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useDeleteUnusedTags({
    onSuccess: () => {
      toast({
        description: `Deleted all ${numUnusedTags} unused tags`,
      });
    },
    onError: () => {
      toast({
        description: "Something went wrong",
        variant: "destructive",
      });
    },
  });
  return (
    <ActionConfirmingDialog
      title={t("tags.delete_all_unused_tags")}
      description={`Are you sure you want to delete the ${numUnusedTags} unused tags?`}
      actionButton={() => (
        <ActionButton
          variant="destructive"
          loading={isPending}
          onClick={() => mutate()}
        >
          DELETE THEM ALL
        </ActionButton>
      )}
    >
      <Button variant="destructive" disabled={numUnusedTags == 0}>
        {t("tags.delete_all_unused_tags")}
      </Button>
    </ActionConfirmingDialog>
  );
}

export default function AllTagsView() {
  const { t } = useTranslation();

  const [searchQueryRaw, setSearchQuery] = useQueryState("q", {
    defaultValue: "",
  });
  const searchQuery = useDebounce(searchQueryRaw, 100);
  const [sortBy, setSortBy] = useQueryState<"name" | "usage" | "relevance">(
    "sort",
    parseAsStringEnum(["name", "usage", "relevance"])
      .withOptions({
        clearOnDefault: true,
      })
      .withDefault("usage"),
  );
  const hasActiveSearch = searchQuery.length > 0;
  const [draggingEnabled, setDraggingEnabled] = React.useState(false);

  const { setVisibleTagIds, isBulkEditEnabled } = useBulkTagActionsStore();

  function toggleDraggingEnabled(): void {
    setDraggingEnabled(!draggingEnabled);
  }

  const {
    data: allHumanTagsRaw,
    isFetching: isHumanTagsFetching,
    isLoading: isHumanTagsLoading,
    hasNextPage: hasNextPageHumanTags,
    fetchNextPage: fetchNextPageHumanTags,
    isFetchingNextPage: isFetchingNextPageHumanTags,
  } = useSavedTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "human",
    limit: 50,
  });

  const {
    data: allAiTagsRaw,
    isFetching: isAiTagsFetching,
    isLoading: isAiTagsLoading,
    hasNextPage: hasNextPageAiTags,
    fetchNextPage: fetchNextPageAiTags,
    isFetchingNextPage: isFetchingNextPageAiTags,
  } = useSavedTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "ai",
    limit: 50,
  });

  const {
    data: allEmptyTagsRaw,
    isFetching: isEmptyTagsFetching,
    isLoading: isEmptyTagsLoading,
    hasNextPage: hasNextPageEmptyTags,
    fetchNextPage: fetchNextPageEmptyTags,
    isFetchingNextPage: isFetchingNextPageEmptyTags,
  } = useSavedTags({
    nameContains: searchQuery,
    sortBy,
    attachedBy: "none",
    limit: 50,
  });

  const isFetching =
    isHumanTagsFetching || isAiTagsFetching || isEmptyTagsFetching;

  const { allHumanTags, allAiTags, allEmptyTags } = React.useMemo(() => {
    return {
      allHumanTags: allHumanTagsRaw?.tags ?? [],
      allAiTags: allAiTagsRaw?.tags ?? [],
      allEmptyTags: allEmptyTagsRaw?.tags ?? [],
    };
  }, [allHumanTagsRaw, allAiTagsRaw, allEmptyTagsRaw]);

  useEffect(() => {
    const allTags = [...allHumanTags, ...allAiTags, ...allEmptyTags];
    setVisibleTagIds(allTags.map((tag) => tag.id) ?? []);
    return () => {
      setVisibleTagIds([]);
    };
  }, [allHumanTags, allAiTags, allEmptyTags, setVisibleTagIds]);

  const sortLabels: Record<typeof sortBy, string> = {
    name: t("tags.sort_by_name"),
    usage: t("tags.sort_by_usage"),
    relevance: t("tags.sort_by_relevance"),
  };

  const tagsToPill = React.useMemo(
    () =>
      (
        tags: ZGetTagResponse[],
        bulkEditEnabled: boolean,
        {
          emptyMessage,
          searchEmptyMessage,
        }: { emptyMessage: string; searchEmptyMessage: string },
        isLoading: boolean,
      ) => {
        if (isLoading && tags.length === 0) {
          return (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 15 }).map((_, index) => (
                <Skeleton key={`tag-skeleton-${index}`} className="h-6 w-16" />
              ))}
            </div>
          );
        }

        if (tags.length === 0) {
          return (
            <EmptyState
              compact={true}
              icon={hasActiveSearch ? <SearchX /> : <Tag />}
              title={hasActiveSearch ? searchEmptyMessage : emptyMessage}
              description={
                hasActiveSearch
                  ? "Try a different keyword or clear the search to browse all tags again."
                  : undefined
              }
            />
          );
        }

        return (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) =>
              bulkEditEnabled ? (
                <MultiTagSelector
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  count={t.numBookmarks}
                />
              ) : (
                <TagPill
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  count={t.numBookmarks}
                  isDraggable={draggingEnabled}
                />
              ),
            )}
            {isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={`tag-skeleton-loading-${index}`}
                  className="h-6 w-16"
                />
              ))}
          </div>
        );
      },
    [draggingEnabled, hasActiveSearch],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t("tags.all_tags")}
          icon={<Tag />}
          action={
            <>
              <CreateTagModal />
              <BulkTagAction />
              <EditingButton
                tooltip={t("tags.drag_and_drop_merging")}
                aria-pressed={draggingEnabled}
                onClick={toggleDraggingEnabled}
                disabled={isBulkEditEnabled}
                ignoreDemoMode
              >
                <Combine />
              </EditingButton>
            </>
          }
        />
        <div className="flex flex-col gap-3">
          <div className="flex w-full items-center gap-2">
            <div className="flex-1">
              <Input
                type="search"
                value={searchQueryRaw}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("common.search")}
                aria-label={t("common.search")}
                startIcon={<Search className="h-4 w-4 text-muted-foreground" />}
                endIcon={isFetching && <Spinner className="h-4 w-4" />}
                autoComplete="off"
                className="h-10"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <EditingButton tooltip={t("actions.sort.title")} ignoreDemoMode>
                  <ArrowDownAZ />
                </EditingButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as typeof sortBy)}
                >
                  <DropdownMenuRadioItem value="usage">
                    {sortLabels["usage"]}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name">
                    {sortLabels["name"]}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="relevance">
                    {sortLabels["relevance"]}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.your_tags")}</span>
            <Badge variant="secondary">
              {allHumanTags.length}
              {hasNextPageHumanTags ? "+" : ""}
            </Badge>
          </CardTitle>
          <CardDescription>{t("tags.your_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allHumanTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_custom_tags"),
              searchEmptyMessage: t("tags.no_tags_match_your_search"),
            },
            isHumanTagsLoading,
          )}
          {hasNextPageHumanTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageHumanTags()}
              loading={isFetchingNextPageHumanTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.ai_tags")}</span>
            <Badge variant="secondary">
              {allAiTags.length}
              {hasNextPageAiTags ? "+" : ""}
            </Badge>
          </CardTitle>
          <CardDescription>{t("tags.ai_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allAiTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_ai_tags"),
              searchEmptyMessage: t("tags.no_tags_match_your_search"),
            },
            isAiTagsLoading,
          )}
          {hasNextPageAiTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageAiTags()}
              loading={isFetchingNextPageAiTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{t("tags.unused_tags")}</span>
            <Badge variant="secondary">
              {allEmptyTags.length}
              {hasNextPageEmptyTags ? "+" : ""}
            </Badge>
          </CardTitle>
          <CardDescription>{t("tags.unused_tags_info")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tagsToPill(
            allEmptyTags,
            isBulkEditEnabled,
            {
              emptyMessage: t("tags.no_unused_tags"),
              searchEmptyMessage: t("tags.no_unused_tags_match_your_search"),
            },
            isEmptyTagsLoading,
          )}
          {hasNextPageEmptyTags && (
            <ActionButton
              variant="secondary"
              onClick={() => fetchNextPageEmptyTags()}
              loading={isFetchingNextPageEmptyTags}
              ignoreDemoMode
            >
              {t("actions.load_more")}
            </ActionButton>
          )}
          {allEmptyTags.length > 0 && (
            <DeleteAllUnusedTags numUnusedTags={allEmptyTags.length} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
