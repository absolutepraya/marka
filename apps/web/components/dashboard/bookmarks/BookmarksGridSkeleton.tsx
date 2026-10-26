"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/client";
import BookmarkCardSkeleton from "./BookmarkCardSkeleton";
import { useServerIsMobile } from "@/lib/serverHints";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";

import { getBookmarkGridColumnPolicy } from "./bookmarkGridColumns";

const responsiveGridClassName =
  "-ml-2 grid w-auto grid-cols-[repeat(var(--bookmark-grid-columns),minmax(0,1fr))] sm:-ml-3 [--bookmark-grid-columns:var(--bookmark-grid-columns-sm)] min-[641px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-md)] min-[769px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-lg)] min-[1025px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-default)]";

export default function BookmarksGridSkeleton({
  count = 12,
}: {
  count?: number;
}) {
  const { t } = useTranslation();
  const layout = useBookmarkLayout();
  const gridColumns = useGridColumns();
  const serverIsMobile = useServerIsMobile();
  const columnPolicy = useMemo(
    () => getBookmarkGridColumnPolicy(gridColumns, serverIsMobile),
    [gridColumns, serverIsMobile],
  );
  const gridColumnStyle = {
    "--bookmark-grid-columns-default": columnPolicy.default,
    "--bookmark-grid-columns-sm": columnPolicy.sm,
    "--bookmark-grid-columns-md": columnPolicy.md,
    "--bookmark-grid-columns-lg": columnPolicy.lg,
  } as CSSProperties;

  const children = Array.from({ length: count }, (_, i) => (
    <BookmarkCardSkeleton key={i} layout={layout} />
  ));
  const masonryChildren = children.map((child, index) => (
    <div key={index} className="pl-2 sm:pl-3">
      {child}
    </div>
  ));

  const grid = bookmarkLayoutSwitch(layout, {
    masonry: (
      <div className={responsiveGridClassName} style={gridColumnStyle}>
        {masonryChildren}
      </div>
    ),
    grid: (
      <div className={responsiveGridClassName} style={gridColumnStyle}>
        {masonryChildren}
      </div>
    ),
    list: <div className="grid grid-cols-1">{children}</div>,
    compact: <div className="grid grid-cols-1">{children}</div>,
  });

  return (
    <div role="status" aria-label={t("common.loading")} aria-busy="true">
      <span className="sr-only">{t("common.loading")}</span>
      <div aria-hidden="true">{grid}</div>
    </div>
  );
}
