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
  const searchStatus = !hasSearchQuery
    ? null
    : searchMarks.length === 0
      ? t("preview.reader_search_no_matches")
      : t("preview.reader_search_matches", {
          current: currentSearchIndex + 1,
          total: searchMarks.length,
        });

  return (
    <div className="mb-6 space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/20 p-2">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <Search
            className="ml-1 size-4 shrink-0 text-muted-foreground"
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
            className="h-9 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
          />
          <span
            className="min-w-20 shrink-0 text-right text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {searchStatus}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => moveSearch(-1)}
            disabled={searchMarks.length === 0}
            aria-label={t("preview.reader_search_previous")}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
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
            className="h-9 shrink-0 gap-2"
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
          className="rounded-xl border border-border/70 bg-card p-3"
        >
          <ol className="space-y-1">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    heading.level === 3 && "pl-5",
                    heading.level === 4 && "pl-8",
                  )}
                  onClick={() => navigateToHeading(heading)}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}
