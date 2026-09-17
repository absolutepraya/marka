"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BookmarkFormattedCreatedAt from "@/components/dashboard/bookmarks/BookmarkFormattedCreatedAt";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import FooterLinkURL from "@/components/dashboard/bookmarks/FooterLinkURL";
import { ActionButton } from "@/components/ui/action-button";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SCREENS } from "@/lib/breakpoints";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "@/components/dashboard/preview/AudioPlayer";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Expand, FileIcon, ImageIcon, Video } from "lucide-react";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";

function TagPill({ tag }: { tag: string }) {
  return (
    <div
      className={cn(
        badgeVariants({ variant: "secondary" }),
        "ease-(--ease-out) border border-border/70 bg-muted/40 font-medium text-muted-foreground transition-[background-color,color,border-color] duration-150 hover:bg-accent hover:text-foreground",
      )}
      key={tag}
    >
      {tag}
    </div>
  );
}

function PublicVideoPreview({ bookmark }: { bookmark: ZPublicBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }

  const { t } = useTranslation();
  const assetUrl = bookmark.content.assetUrl;
  const fileName = bookmark.content.fileName || t("common.video");
  const isMatroska =
    bookmark.content.contentType === "video/x-matroska" ||
    bookmark.content.fileName?.toLowerCase().endsWith(".mkv") === true;
  const [playbackError, setPlaybackError] = useState(isMatroska);

  useEffect(() => {
    setPlaybackError(isMatroska);
  }, [assetUrl, bookmark.content.contentType, isMatroska]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted/30">
      {playbackError ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          <Video className="h-8 w-8" aria-hidden="true" />
          <p>{t("common.video_playback_unavailable")}</p>
          <Link
            href={assetUrl}
            download={fileName}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t("actions.download_file", { fileName })}
          </Link>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are not yet part of the uploaded-video model */}
          <video
            key={`${assetUrl}:${bookmark.content.contentType ?? ""}`}
            className="h-full w-full object-contain"
            controls
            preload="metadata"
            playsInline
            poster={bookmark.bannerImageUrl ?? undefined}
            aria-label={bookmark.title || fileName}
            onError={() => setPlaybackError(true)}
          >
            <source
              src={assetUrl}
              type={bookmark.content.contentType ?? undefined}
            />
            {t("common.video_browser_unsupported")}
          </video>
        </>
      )}
    </div>
  );
}

function PublicAudioPreview({ bookmark }: { bookmark: ZPublicBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/70 bg-muted/30">
      <AudioPlayer
        src={bookmark.content.assetUrl}
        fileName={bookmark.content.fileName}
        contentType={bookmark.content.contentType}
        title={bookmark.title}
        compact
      />
    </div>
  );
}

function BookmarkCard({ bookmark }: { bookmark: ZPublicBookmark }) {
  const renderContent = () => {
    switch (bookmark.content.type) {
      case BookmarkTypes.LINK:
        return (
          <div className="space-y-3">
            {bookmark.bannerImageUrl && (
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted/30">
                <Link href={bookmark.content.url} target="_blank">
                  {/* oxlint-disable-next-line no-img-element */}
                  <img
                    src={bookmark.bannerImageUrl}
                    alt={bookmark.title ?? "Link preview"}
                    className="ease-(--ease-out) h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                  />
                </Link>
              </div>
            )}
            <div className="space-y-2">
              <Link
                href={bookmark.content.url}
                target="_blank"
                className="line-clamp-2 text-ellipsis text-lg font-semibold leading-snug tracking-tight text-foreground"
              >
                {bookmark.title || "Untitled"}
              </Link>
            </div>
          </div>
        );

      case BookmarkTypes.TEXT:
        return (
          <div className="space-y-3">
            {bookmark.title && (
              <h3 className="line-clamp-2 text-ellipsis text-lg font-semibold leading-snug tracking-tight text-foreground">
                {bookmark.title}
              </h3>
            )}
            <div className="group relative rounded-xl border border-border/70 bg-background/70 p-3">
              <div className="max-h-64 overflow-hidden">
                <BookmarkMarkdownComponent readOnly={true}>
                  {{
                    id: bookmark.id,
                    content: {
                      text: bookmark.content.text,
                      format: bookmark.content.format,
                    },
                  }}
                </BookmarkMarkdownComponent>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="shadow-xs absolute bottom-3 right-3 size-8 rounded-full border border-border/70 bg-background/90 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  >
                    <Expand className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] max-w-3xl overflow-auto">
                  <BookmarkMarkdownComponent readOnly={true}>
                    {{
                      id: bookmark.id,
                      content: {
                        text: bookmark.content.text,
                        format: bookmark.content.format,
                      },
                    }}
                  </BookmarkMarkdownComponent>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        );

      case BookmarkTypes.ASSET:
        return (
          <div className="space-y-3">
            {bookmark.content.assetType === "video" ? (
              <PublicVideoPreview bookmark={bookmark} />
            ) : bookmark.content.assetType === "audio" ? (
              <PublicAudioPreview bookmark={bookmark} />
            ) : bookmark.bannerImageUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted/30">
                <Link href={bookmark.content.assetUrl} target="_blank">
                  {/* oxlint-disable-next-line no-img-element */}
                  <img
                    src={bookmark.bannerImageUrl}
                    alt={bookmark.title ?? "Asset preview"}
                    className="ease-(--ease-out) h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                  />
                </Link>
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30 text-muted-foreground">
                {bookmark.content.assetType === "image" ? (
                  <ImageIcon className="h-8 w-8" />
                ) : (
                  <FileIcon className="h-8 w-8" />
                )}
              </div>
            )}
            <div className="space-y-1">
              <Link
                href={bookmark.content.assetUrl}
                target="_blank"
                className="line-clamp-2 text-ellipsis text-lg font-semibold leading-snug tracking-tight text-foreground"
              >
                {bookmark.title || "Untitled"}
              </Link>
            </div>
          </div>
        );
    }
  };

  return (
    <Card className="ease-(--ease-out) shadow-xs mb-4 rounded-2xl border border-border/70 bg-card/95 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="space-y-3 p-3.5">
        {renderContent()}

        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bookmark.tags.map((tag, index) => (
              <TagPill key={index} tag={tag} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {bookmark.content.type === BookmarkTypes.LINK && (
              <>
                <FooterLinkURL url={bookmark.content.url} />
                <span className="text-border">•</span>
              </>
            )}
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getBreakpointConfig() {
  const breakpointColumnsObj: { [key: number]: number; default: number } = {
    default: 3,
  };
  breakpointColumnsObj[SCREENS.lg] = 2;
  breakpointColumnsObj[SCREENS.md] = 1;
  breakpointColumnsObj[SCREENS.sm] = 1;
  return breakpointColumnsObj;
}

export default function PublicBookmarkGrid({
  bookmarks: initialBookmarks,
  nextCursor,
  list,
}: {
  list: {
    id: string;
    name: string;
    description: string | null | undefined;
    icon: string;
    numItems: number;
    ownerName: string;
    ownerImage: string | null;
  };
  bookmarks: ZPublicBookmark[];
  nextCursor: ZCursor | null;
}) {
  const api = useTRPC();
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      api.publicBookmarks.getPublicBookmarksInList.infiniteQueryOptions(
        { listId: list.id },
        {
          initialData: () => ({
            pages: [{ bookmarks: initialBookmarks, nextCursor, list }],
            pageParams: [null],
          }),
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          refetchOnMount: true,
        },
      ),
    );

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadMoreButtonInView]);

  const breakpointConfig = useMemo(() => getBreakpointConfig(), []);

  const bookmarks = useMemo(() => {
    return data.pages.flatMap((b) => b.bookmarks);
  }, [data]);

  return (
    <>
      <Masonry
        className="-ml-4 flex w-auto"
        columnClassName="pl-4"
        breakpointCols={breakpointConfig}
      >
        {bookmarks.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </Masonry>
      {hasNextPage && (
        <div className="flex justify-center pt-2">
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
    </>
  );
}
