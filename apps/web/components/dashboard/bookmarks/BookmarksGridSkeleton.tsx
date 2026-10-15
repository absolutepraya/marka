import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerIsMobile } from "@/lib/serverHints";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";

import { getBookmarkGridColumnPolicy } from "./bookmarkGridColumns";

const responsiveGridClassName =
  "-ml-4 grid w-auto grid-cols-[repeat(var(--bookmark-grid-columns),minmax(0,1fr))] [--bookmark-grid-columns:var(--bookmark-grid-columns-sm)] min-[641px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-md)] min-[769px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-lg)] min-[1025px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-default)]";

// Each skeleton mirrors the geometry of the real card for its layout so the
// load -> loaded transition doesn't jump.
function CardSkeleton({ layout }: { layout: BookmarksLayoutTypes }) {
  if (layout === "compact") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <Skeleton className="size-5 shrink-0 rounded" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
    );
  }
  if (layout === "list") {
    return (
      <div className="mb-4 flex gap-4 rounded-lg border border-border bg-card p-2">
        <Skeleton className="size-32 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2 py-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-auto h-3 w-24" />
        </div>
      </div>
    );
  }
  // grid / masonry: image on top, padded title + tags + meta below
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      <Skeleton className="h-56 w-full !rounded-none" />
      <div className="flex flex-col gap-2 p-2">
        <Skeleton className="h-5 w-3/4" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-6" />
        </div>
      </div>
    </div>
  );
}

export default function BookmarksGridSkeleton({
  count = 12,
}: {
  count?: number;
}) {
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
    <CardSkeleton key={i} layout={layout} />
  ));
  const masonryChildren = children.map((child, index) => (
    <div key={index} className="pl-4">
      {child}
    </div>
  ));

  return bookmarkLayoutSwitch(layout, {
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
}
