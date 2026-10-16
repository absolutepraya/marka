"use client";

import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n/client";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { SlidersHorizontal } from "lucide-react";

// Keep the existing expression grouped so a new filter also constrains OR queries.
export function appendSearchFilters(query: string, filters: string[]) {
  const existing = query.trim();
  return [existing ? `(${existing})` : "", ...filters]
    .filter(Boolean)
    .join(" ");
}

export function SearchFilters({
  query,
  onApply,
  onOpen,
  offline,
}: {
  query: string;
  onApply: (query: string) => void;
  onOpen: () => void;
  offline: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const hasFilters = !!parseSearchQuery(query).matcher;
  const selectClassName =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-9 shrink-0 rounded-lg"
          aria-label={t("search.filters")}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {hasFilters && (
            <span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onKeyDown={(event) => event.stopPropagation()}
        align="end"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
        aria-labelledby={`${id}-title`}
      >
        <h2 id={`${id}-title`} className="font-medium">
          {t("search.filters")}
        </h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          {t(offline ? "search.filters_offline" : "search.filters_hint")}
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const filters: string[] = [];
            for (const name of ["type", "status"]) {
              const value = String(data.get(name) ?? "");
              if (value) filters.push(value);
            }
            for (const name of ["list", "tag", "url", "after", "before"]) {
              const value = String(data.get(name) ?? "").trim();
              if (value) filters.push(`${name}:"${value}"`);
            }
            if (filters.length) onApply(appendSearchFilters(query, filters));
            setOpen(false);
          }}
        >
          <fieldset
            disabled={offline}
            className="space-y-3 disabled:opacity-50"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm" htmlFor={`${id}-type`}>
                <span>{t("search.content_type")}</span>
                <select
                  id={`${id}-type`}
                  name="type"
                  className={selectClassName}
                >
                  <option value="">{t("search.any")}</option>
                  <option value="is:link">{t("search.links")}</option>
                  <option value="is:text">{t("search.notes")}</option>
                  <option value="is:media">{t("search.media")}</option>
                </select>
              </label>
              <label className="space-y-1 text-sm" htmlFor={`${id}-status`}>
                <span>{t("search.status")}</span>
                <select
                  id={`${id}-status`}
                  name="status"
                  className={selectClassName}
                >
                  <option value="">{t("search.any")}</option>
                  <option value="is:fav">{t("lists.favourites")}</option>
                  <option value="is:archived">{t("common.archive")}</option>
                  <option value="-is:archived">
                    {t("search.is_not_archived")}
                  </option>
                  <option value="-is:tagged">{t("search.has_no_tags")}</option>
                  <option value="is:broken">
                    {t("search.is_broken_link")}
                  </option>
                </select>
              </label>
            </div>
            {(
              [
                ["list", "search.is_in_list"],
                ["tag", "search.has_tag"],
                ["url", "search.url_contains"],
              ] as const
            ).map(([name, label]) => (
              <label
                key={name}
                htmlFor={`${id}-${name}`}
                className="block space-y-1 text-sm"
              >
                <span>{t(label)}</span>
                <Input id={`${id}-${name}`} name={name} pattern={'[^"]*'} />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["after", "search.created_on_or_after"],
                  ["before", "search.created_on_or_before"],
                ] as const
              ).map(([name, label]) => (
                <label
                  key={name}
                  htmlFor={`${id}-${name}`}
                  className="min-w-0 space-y-1 text-xs"
                >
                  <span>{t(label)}</span>
                  <Input
                    className="min-w-0 px-2"
                    type="date"
                    id={`${id}-${name}`}
                    name={name}
                  />
                </label>
              ))}
            </div>
            <Button className="w-full" type="submit">
              {t("search.apply_filters")}
            </Button>
          </fieldset>
        </form>
      </PopoverContent>
    </Popover>
  );
}
