"use client";

import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/highlights.bones.json";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import useRelativeTime from "@/lib/hooks/relative-time";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Dot, Highlighter, LinkIcon, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";

import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  ZGetAllHighlightsResponse,
  ZHighlight,
} from "@karakeep/shared/types/highlights";

import HighlightCard from "./HighlightCard";

function Highlight({ highlight }: { highlight: ZHighlight }) {
  const { i18n } = useTranslation();
  const { fromNow, localCreatedAt } = useRelativeTime(
    highlight.createdAt,
    i18n.language,
  );
  return (
    <HighlightRowContent
      highlight={highlight}
      fromNow={fromNow}
      localCreatedAt={localCreatedAt}
      card={
        <HighlightCard
          highlight={highlight}
          clickable={false}
          readOnly={false}
        />
      }
    />
  );
}

export function HighlightRowContent({
  highlight,
  fromNow,
  localCreatedAt,
  card,
}: {
  highlight: ZHighlight;
  fromNow: string;
  localCreatedAt: string;
  card: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {card}
      <span className="flex items-center gap-0.5 text-xs italic text-muted-foreground">
        <span title={localCreatedAt}>{fromNow}</span>
        <Dot />
        <Link
          href={`/dashboard/preview/${highlight.bookmarkId}`}
          className="flex items-center gap-0.5"
        >
          <LinkIcon className="size-3 italic" />
          {t("common.source")}
        </Link>
      </span>
    </div>
  );
}

export default function AllHighlights({
  highlights: initialHighlights,
}: {
  highlights: ZGetAllHighlightsResponse;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Use search endpoint if searchQuery is provided, otherwise use getAll
  const useSearchQuery = debouncedSearch.trim().length > 0;

  const getAllQuery = useInfiniteQuery(
    api.highlights.getAll.infiniteQueryOptions(
      {},
      {
        enabled: !useSearchQuery,
        initialData: !useSearchQuery
          ? () => ({
              pages: [initialHighlights],
              pageParams: [null],
            })
          : undefined,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const searchQueryResult = useInfiniteQuery(
    api.highlights.search.infiniteQueryOptions(
      { text: debouncedSearch },
      {
        enabled: useSearchQuery,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useSearchQuery ? searchQueryResult : getAllQuery;

  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();
  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  const allHighlights = data?.pages.flatMap((p) => p.highlights);

  return (
    <div className="flex flex-col gap-4">
      {/* Search Input */}
      <div className="relative">
        <Input
          type="text"
          placeholder="Search highlights..."
          aria-label={t("search.placeholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          startIcon={<Search className="size-4 text-muted-foreground" />}
          endIcon={
            searchInput && (
              <ButtonWithTooltip
                tooltip={t("actions.clear", { defaultValue: "Clear search" })}
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={() => setSearchInput("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </ButtonWithTooltip>
            )
          }
          className="w-full"
        />
      </div>

      {/* Results */}
      <div className="flex flex-col gap-2">
        {isPending && !data && (
          <CapturedSkeleton name="highlights" bones={bones} />
        )}
        {allHighlights &&
          allHighlights.length > 0 &&
          allHighlights.map((h) => (
            <React.Fragment key={h.id}>
              <Highlight highlight={h} />
              <Separator className="m-2 last:hidden" />
            </React.Fragment>
          ))}
        {allHighlights && allHighlights.length == 0 && (
          <EmptyState
            compact={true}
            icon={<Highlighter />}
            title={
              useSearchQuery
                ? "No highlights match your search"
                : t("highlights.no_highlights")
            }
            description={
              useSearchQuery
                ? "Try a different keyword or clear the search to see every saved highlight."
                : "Highlights from your saved reading will appear here once you start collecting them."
            }
          />
        )}
        {hasNextPage && (
          <div className="flex justify-center">
            <ActionButton
              ref={loadMoreRef}
              ignoreDemoMode={true}
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              variant="ghost"
            >
              Load More
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
