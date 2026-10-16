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

type FilterName =
  | "type"
  | "status"
  | "list"
  | "tag"
  | "url"
  | "after"
  | "before";

// Only conjunctive qualifiers are editable here. Alternatives within an OR
// expression cannot be represented by a single control and remain in the query.
export function readSearchFilters(query: string) {
  const values: Record<FilterName, string> = {
    type: "",
    status: "",
    list: "",
    tag: "",
    url: "",
    after: "",
    before: "",
  };
  if (parseSearchQuery(query).result !== "full")
    return { values, remainder: query };
  const tokens = query.match(/(?:[^\s()"]+|"[^"]*")+|[()]/g) ?? [];
  let index = 0;
  type Term = string | Term[];
  function read(): Term[] {
    const terms: Term[] = [];
    while (index < tokens.length) {
      const token = tokens[index++];
      if (token === ")") break;
      terms.push(token === "(" ? read() : token);
    }
    return terms;
  }
  function print(term: Term): string {
    return typeof term === "string" ? term : `(${term.map(print).join(" ")})`;
  }
  function extract(terms: Term[]): string {
    if (terms.some((term) => typeof term === "string" && /^or$/i.test(term))) {
      return terms.map(print).join(" ");
    }
    return terms
      .flatMap((term, termIndex) => {
        if (Array.isArray(term)) {
          const remaining = extract(term);
          return remaining ? [`(${remaining})`] : [];
        }
        if (termIndex > 0 && /^and$/i.test(term)) return [];
        let name: FilterName | undefined;
        let value = term;
        if (/^is:(link|text|media)$/.test(term)) name = "type";
        else if (
          /^(is:(fav|archived|broken)|-is:(archived|tagged))$/.test(term)
        )
          name = "status";
        else {
          const match =
            /^(list|tag|url|after|before):(?:"([^"]+)"|([^"\s]+))$/.exec(term);
          if (match) {
            name = match[1] as FilterName;
            value = match[2] ?? match[3];
            // Keep date expressions that a native date input cannot represent.
            if (
              (name === "after" || name === "before") &&
              !/^\d{4}-\d{2}-\d{2}$/.test(value)
            )
              name = undefined;
          }
        }
        if (!name || !parseSearchQuery(term).matcher) return [term];
        // Preserve additional conditions that cannot fit in the same control.
        if (values[name]) return [term];
        values[name] = value;
        return [];
      })
      .join(" ");
  }
  const remainder = extract(read());
  return { values, remainder };
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
  const { values, remainder } = readSearchFilters(query);
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
          key={query}
          className="space-y-3"
          action={(data) => {
            const filters: string[] = [];
            for (const name of ["type", "status"]) {
              const value = String(data.get(name) ?? "");
              if (value) filters.push(value);
            }
            for (const name of ["list", "tag", "url", "after", "before"]) {
              const value = String(data.get(name) ?? "").trim();
              if (value) filters.push(`${name}:"${value}"`);
            }
            onApply(appendSearchFilters(remainder, filters));
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
                  defaultValue={values.type}
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
                  defaultValue={values.status}
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
                <Input
                  id={`${id}-${name}`}
                  name={name}
                  defaultValue={values[name]}
                  pattern={'[^"]*'}
                />
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
                    defaultValue={values[name]}
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
