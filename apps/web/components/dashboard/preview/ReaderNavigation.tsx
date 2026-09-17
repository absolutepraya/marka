"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, List, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyReaderSearchMarks,
  clearReaderSearchMarks,
  prepareReaderHeadings,
  setCurrentReaderSearchMark,
} from "@karakeep/shared/utils/reader-navigation-dom";
import type { ReaderHeading } from "@karakeep/shared/utils/reader-navigation-dom";

function getReaderScrollBehavior(): ScrollBehavior {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "auto";
  }

  return "smooth";
}

function getHeadingNumbers(headings: ReaderHeading[]): string[] {
  const counters = [0, 0, 0];

  return headings.map(({ level }) => {
    const levelIndex = level - 2;

    for (let index = 0; index < levelIndex; index += 1) {
      if (counters[index] === 0) counters[index] = 1;
    }

    counters[levelIndex] += 1;

    for (let index = levelIndex + 1; index < counters.length; index += 1) {
      counters[index] = 0;
    }

    return counters.slice(0, levelIndex + 1).join(".");
  });
}

function focusHeading(heading: HTMLElement) {
  if (typeof heading.scrollIntoView === "function") {
    heading.scrollIntoView({
      behavior: getReaderScrollBehavior(),
      block: "start",
    });
  }

  try {
    heading.focus({ preventScroll: true });
  } catch {
    heading.focus();
  }
}

export default function ReaderNavigation({
  contentRef,
  contentKey,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
}) {
  const { t } = useTranslation();
  const [headings, setHeadings] = useState<ReaderHeading[]>([]);
  const [tableOfContentsOpen, setTableOfContentsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMarks, setSearchMarks] = useState<HTMLElement[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableOfContentsButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const tableOfContentsId = useId();

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    setHeadings(prepareReaderHeadings(content));
    setTableOfContentsOpen(false);
    clearReaderSearchMarks(content);

    return () => {
      clearReaderSearchMarks(content);
    };
  }, [contentKey, contentRef]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const marks = applyReaderSearchMarks(content, searchQuery);
    setSearchMarks(marks);
    setCurrentSearchIndex(marks.length > 0 ? 0 : -1);
  }, [contentKey, contentRef, searchQuery]);

  useEffect(() => {
    const currentMark = setCurrentReaderSearchMark(
      searchMarks,
      currentSearchIndex,
    );
    if (currentMark && typeof currentMark.scrollIntoView === "function") {
      currentMark.scrollIntoView({
        behavior: getReaderScrollBehavior(),
        block: "center",
      });
    }
  }, [currentSearchIndex, searchMarks]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (
        !(event.target instanceof Node) ||
        !navigationRef.current?.contains(event.target)
      ) {
        return;
      }

      if (tableOfContentsOpen) {
        event.preventDefault();
        setTableOfContentsOpen(false);
        tableOfContentsButtonRef.current?.focus();
        return;
      }

      if (searchQuery) {
        event.preventDefault();
        setSearchQuery("");
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [searchQuery, tableOfContentsOpen]);

  const moveSearch = useCallback(
    (direction: 1 | -1) => {
      if (searchMarks.length === 0) return;

      setCurrentSearchIndex((current) => {
        const startingIndex = current < 0 ? 0 : current;
        return (
          (startingIndex + direction + searchMarks.length) % searchMarks.length
        );
      });
    },
    [searchMarks.length],
  );

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    moveSearch(event.shiftKey ? -1 : 1);
  };

  const navigateToHeading = (heading: ReaderHeading) => {
    setTableOfContentsOpen(false);
    focusHeading(heading.element);
  };

  const hasSearchQuery = searchQuery.trim().length > 0;
  const headingNumbers = getHeadingNumbers(headings);
  const searchStatus = !hasSearchQuery
    ? null
    : searchMarks.length === 0
      ? t("preview.reader_search_no_matches")
      : t("preview.reader_search_matches", {
          current: currentSearchIndex + 1,
          total: searchMarks.length,
        });

  return (
    <div ref={navigationRef} className="mb-2 space-y-1 print:hidden sm:mb-3 sm:space-y-1.5">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-background p-1 sm:gap-1.5">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-1">
          <Search
            className="ml-1 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={inputId} className="sr-only">
            {t("preview.reader_search_label")}
          </label>
          <Input
            ref={searchInputRef}
            id={inputId}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("preview.reader_search_placeholder")}
            aria-label={t("preview.reader_search_label")}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0"
          />
          <span
            className="max-w-20 min-w-0 shrink truncate text-right text-[0.6875rem] text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {searchStatus}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => moveSearch(-1)}
            disabled={searchMarks.length === 0}
            aria-label={t("preview.reader_search_previous")}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => moveSearch(1)}
            disabled={searchMarks.length === 0}
            aria-label={t("preview.reader_search_next")}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {headings.length >= 2 && (
          <Button
            ref={tableOfContentsButtonRef}
            type="button"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 px-2.5"
            onClick={() => setTableOfContentsOpen((open) => !open)}
            aria-expanded={tableOfContentsOpen}
            aria-controls={tableOfContentsId}
          >
            <List className="size-4" aria-hidden="true" />
            <span>{t("preview.reader_table_of_contents")}</span>
            {tableOfContentsOpen ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      {headings.length >= 2 && tableOfContentsOpen && (
        <nav
          id={tableOfContentsId}
          aria-label={t("preview.reader_table_of_contents")}
          className="rounded-lg border border-border/70 bg-card p-2"
        >
          <ol className="space-y-0.5">
            {headings.map((heading, index) => (
              <li key={heading.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    heading.level === 3 && "pl-5",
                    heading.level === 4 && "pl-8",
                  )}
                  onClick={() => navigateToHeading(heading)}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex min-w-7 shrink-0 justify-center whitespace-nowrap rounded-sm bg-muted/70 px-1 text-xs font-medium tabular-nums leading-5 text-muted-foreground"
                  >
                    {headingNumbers[index]}
                  </span>
                  <span className="min-w-0 flex-1">{heading.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
