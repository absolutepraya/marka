"use client";

import { useSavedQuery } from "@/lib/offline-library/use-saved-query";

import { usePaginatedSearchTags } from "@karakeep/shared-react/hooks/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

export function useSavedTags(input: {
  nameContains: string;
  sortBy: "name" | "usage" | "relevance";
  attachedBy: "human" | "ai" | "none";
  limit: number;
}) {
  const api = useTRPC();
  const options = api.tags.list.infiniteQueryOptions(input);
  useSavedQuery(options.queryKey, {
    enabled: !input.nameContains && input.sortBy !== "relevance",
  });
  return usePaginatedSearchTags(input);
}
