"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import { useEffect, useRef, useState } from "react";
import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import { Skeleton } from "@/components/ui/skeleton";

import captures from "./bones/bookmark-cards.bones.json";
import { bookmarkCardSurface } from "./BookmarkCardFrame";
import { selectBookmarkSkeleton } from "./bookmarkSkeletonGeometry";

function CardFallback({ layout }: { layout: BookmarksLayoutTypes }) {
  if (layout === "compact") {
    return (
      <div className="flex items-center gap-2 p-3">
        <Skeleton className="size-5 shrink-0" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (layout === "list") {
    return (
      <div className="flex gap-4 p-3">
        <Skeleton className="size-32 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-3 py-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    );
  }
  return (
    <>
      <Skeleton className="aspect-square w-full !rounded-none sm:aspect-auto sm:h-56" />
      <div className="space-y-2 p-2 sm:p-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </>
  );
}

export default function BookmarkCardSkeleton({
  layout,
}: {
  layout: BookmarksLayoutTypes;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, desktop: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => {
      const width = Math.round(element.getBoundingClientRect().width);
      setSize((previous) =>
        previous.width === width && previous.desktop === media.matches
          ? previous
          : { width, desktop: media.matches },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    media.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  const bones = selectBookmarkSkeleton(
    captures,
    layout,
    size.width,
    size.desktop,
  );

  return (
    <div
      ref={ref}
      className="mb-1 min-w-0 sm:mb-3"
      style={{ height: bones?.height }}
      data-bookmark-skeleton={layout}
    >
      <BoneyardSkeleton
        key={`${layout}-${size.desktop}-${size.width}`}
        className={`${bookmarkCardSurface} h-full`}
        loading
        initialBones={bones}
        color="var(--muted)"
        darkColor="var(--muted)"
        animate="solid"
        boneClass="animate-pulse"
        fallback={<CardFallback layout={layout} />}
      >
        {null}
      </BoneyardSkeleton>
    </div>
  );
}
