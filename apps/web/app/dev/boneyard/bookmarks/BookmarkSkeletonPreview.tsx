"use client";

import type { UserLocalSettings } from "@/lib/userLocalSettings/types";
import { Skeleton as CaptureSkeleton } from "boneyard-js/react";
import { SessionProvider } from "@/lib/auth/client";
import { UserLocalSettingsCtx } from "@/lib/userLocalSettings/bookmarksLayout";
import BookmarkCard from "@/components/dashboard/bookmarks/BookmarkCard";
import { BookmarkCardFrame } from "@/components/dashboard/bookmarks/BookmarkCardFrame";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";

import type { ZBookmarkTypeLink } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const widths = [112, 144, 176, 208, 256, 320, 400, 560, 800, 1100, 1360];
const layouts = ["masonry", "grid", "list", "compact"] as const;
const titles = [
  "A quieter place for everything you want to read",
  "Design notes for a thoughtful reading library",
  "Building useful things, one small step at a time",
  "Good ideas are worth keeping",
];
const bookmarks: ZBookmarkTypeLink[] = Array.from(
  { length: 12 },
  (_, index) => ({
    id: `skeleton-fixture-${index}`,
    userId: "skeleton-fixture",
    createdAt: new Date("2000-01-01T00:00:00Z"),
    modifiedAt: null,
    archived: false,
    favourited: false,
    taggingStatus: "success",
    summarizationStatus: "success",
    embeddingStatus: "success",
    tags: [{ id: "fixture-reading", name: "Reading", attachedBy: "human" }],
    assets: [],
    content: {
      type: BookmarkTypes.LINK,
      url: "https://reading.example/notes",
      title: titles[index % titles.length],
      imageUrl: "/brand/marka/marka-social.png",
      favicon: "/brand/marka/marka-icon-16.png",
      crawlStatus: "success",
    },
  }),
);

export default function BookmarkSkeletonPreview({
  settings,
  capture,
  state,
}: {
  settings: UserLocalSettings;
  capture: boolean;
  state?: string;
}) {
  return (
    <SessionProvider session={null}>
      <UserLocalSettingsCtx.Provider value={settings}>
        {/* Real cards stay inert: synthetic preview IDs must never be edited. */}
        <div inert>
          {capture ? (
            layouts.flatMap((layout) =>
              widths.map((width) => (
                <UserLocalSettingsCtx.Provider
                  key={`${layout}-${width}`}
                  value={{ ...settings, bookmarkGridLayout: layout }}
                >
                  <div style={{ width }}>
                    <CaptureSkeleton
                      name={`bookmark-${layout}-${width}`}
                      loading={false}
                      snapshotConfig={{ leafTags: ["div"] }}
                    >
                      <BookmarkCardFrame>
                        <BookmarkCard bookmark={bookmarks[0]} />
                      </BookmarkCardFrame>
                    </CaptureSkeleton>
                  </div>
                </UserLocalSettingsCtx.Provider>
              )),
            )
          ) : state === "loaded" ||
            state === "pagination" ||
            state === "offline-ready" ? (
            <BookmarksGrid
              bookmarks={bookmarks.slice(0, 6)}
              hasNextPage={state === "pagination"}
              isFetchingNextPage={state === "pagination"}
            />
          ) : (
            <BookmarksGridSkeleton count={6} />
          )}
        </div>
      </UserLocalSettingsCtx.Provider>
    </SessionProvider>
  );
}
