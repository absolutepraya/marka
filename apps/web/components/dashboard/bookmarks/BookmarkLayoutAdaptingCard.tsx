"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/client";
import useBulkActionsStore from "@/lib/bulkActions";
import {
  bookmarkLayoutSwitch,
  useBookmarkDisplaySettings,
  useBookmarkLayout,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  AudioLines,
  Image as ImageIcon,
  NotebookPen,
  Video,
} from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillTagging,
} from "@karakeep/shared/utils/bookmarkUtils";
import { switchCase } from "@karakeep/shared/utils/switch";

import BookmarkActionBar from "./BookmarkActionBar";
import { BookmarkDragHandle } from "./BookmarkDragHandle";
import { canSelectBookmarkForBulkActions } from "./bookmarkListPermissions";
import BookmarkFormattedCreatedAt from "./BookmarkFormattedCreatedAt";
import BookmarkOwnerIcon from "./BookmarkOwnerIcon";
import Favicon from "./Favicon";
import { NotePreview } from "./NotePreview";
import TagList from "./TagList";

interface Props {
  bookmark: ZBookmark;
  image: (layout: BookmarksLayoutTypes, className: string) => ReactNode;
  title?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  className?: string;
  fitHeight?: boolean;
  wrapTags: boolean;
  bookmarkIndex?: number;
}

function BottomRow({
  footer,
  bookmark,
}: {
  footer?: ReactNode;
  bookmark: ZBookmark;
}) {
  const sourceUrl = getSourceUrl(bookmark);
  const storedFavicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : null;
  return (
    <div className="flex w-full shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground sm:text-sm">
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-nowrap sm:gap-2">
        {sourceUrl && (
          <Favicon
            url={sourceUrl}
            storedFavicon={storedFavicon}
            allowRemoteFallback={true}
            className="size-4 shrink-0"
          />
        )}
        {footer && (
          <>
            <div className="min-w-0 overflow-hidden">{footer}</div>
            <span aria-hidden>•</span>
          </>
        )}
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          suppressHydrationWarning
          className="ease-(--ease-out) shrink-0 transition-colors duration-150 hover:text-foreground"
        >
          <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
        </Link>
      </div>
      <BookmarkActionBar bookmark={bookmark} />
    </div>
  );
}

function OwnerIndicator({ bookmark }: { bookmark: ZBookmark }) {
  const api = useTRPC();
  const listContext = useBookmarkListContext();
  const collaborators = useQuery(
    api.lists.getCollaborators.queryOptions(
      {
        listId: listContext?.id ?? "",
      },
      {
        refetchOnWindowFocus: false,
        enabled: !!listContext?.hasCollaborators,
      },
    ),
  );

  if (!listContext || listContext.userRole === "owner" || !collaborators.data) {
    return null;
  }

  let owner = undefined;
  if (bookmark.userId === collaborators.data.owner?.id) {
    owner = collaborators.data.owner;
  } else {
    owner = collaborators.data.collaborators.find(
      (c) => c.userId === bookmark.userId,
    )?.user;
  }

  if (!owner) return null;

  return (
    <div className="absolute right-2 top-2 z-40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <BookmarkOwnerIcon ownerName={owner.name} ownerAvatar={owner.image} />
    </div>
  );
}

function MultiBookmarkSelector({ bookmark }: { bookmark: ZBookmark }) {
  const isSelected = useBulkActionsStore((s) =>
    s.isBookmarkSelected(bookmark.id),
  );
  const isBulkEditEnabled = useBulkActionsStore((s) => s.isBulkEditEnabled);
  const toggleBookmark = useBulkActionsStore((state) => state.toggleBookmark);
  const { data: session } = useSession();

  const listContext = useBookmarkListContext();
  const canSelect = canSelectBookmarkForBulkActions({
    bookmarkOwnerId: bookmark.userId,
    currentUserId: session?.user?.id,
    listContext,
  });
  if (!isBulkEditEnabled || !canSelect) return null;

  return (
    <button
      type="button"
      className={cn(
        "absolute left-0 top-0 z-50 h-full w-full cursor-pointer transition-colors",
        isSelected ? "bg-foreground/10" : "bg-transparent",
      )}
      aria-label={getBookmarkTitle(bookmark) ?? "Untitled bookmark"}
      aria-pressed={isSelected}
      onClick={() => toggleBookmark(bookmark.id)}
    >
      <div className="absolute right-2 top-2 z-50">
        <div
          className={cn(
            "flex size-4 items-center justify-center rounded-full border",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground bg-background/60 text-transparent",
          )}
        >
          <Check size={12} />
        </div>
      </div>
    </button>
  );
}

function ListView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;

  return (
    <div
      className={cn(
        "group relative flex max-h-96 gap-4 overflow-hidden rounded-2xl p-3 sm:p-3.5",
        className,
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <BookmarkDragHandle
        bookmark={bookmark}
        className="left-1 top-1/2 -translate-y-1/2"
      />
      <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/25">
        {image("list", cn("size-32 rounded-xl", imgFitClass))}
      </div>
      <div className="flex h-full flex-1 flex-col justify-between gap-3 overflow-hidden">
        <div className="flex flex-col gap-2.5 overflow-hidden">
          {showTitle && title && (
            <div className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-lg font-semibold leading-snug tracking-tight">
              {title}
            </div>
          )}
          {content && (
            <div className="shrink-1 max-h-40 overflow-hidden text-sm text-foreground/90">
              {content}
            </div>
          )}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags &&
            (bookmark.tags.length > 0 || isBookmarkStillTagging(bookmark)) && (
              <div className="flex shrink-0 flex-wrap gap-1">
                <TagList
                  bookmark={bookmark}
                  loading={isBookmarkStillTagging(bookmark)}
                />
              </div>
            )}
        </div>
        <BottomRow footer={footer} bookmark={bookmark} />
      </div>
    </div>
  );
}

function GridView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  wrapTags,
  layout,
  bookmarkIndex,
}: Props & { layout: BookmarksLayoutTypes }) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;
  // Use a landscape preview and tighter spacing on mobile; the `sm:` sizes
  // restore the roomier desktop card.
  const img = image(
    "grid",
    cn("size-full rounded-t-xl sm:rounded-t-2xl", imgFitClass),
  );
  const sourceUrl = getSourceUrl(bookmark);
  const storedFavicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : null;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl sm:rounded-2xl",
        className,
        // Desktop grid cards stay a uniform height. Mobile cards grow with
        // their square preview so the title, content, and actions are not clipped.
        layout === "grid" ? "h-auto sm:h-96" : "h-auto",
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <BookmarkDragHandle bookmark={bookmark} className="left-2 top-2" />
      {img && (
        <div className="aspect-square w-full shrink-0 overflow-hidden border-b border-border/60 bg-muted/20 sm:aspect-auto sm:h-56 sm:min-h-56">
          {img}
        </div>
      )}
      <div className="flex h-full flex-col justify-between gap-1 overflow-hidden p-2 pb-1 sm:gap-0 sm:p-0">
        <div
          className={cn(
            "grow-1 flex flex-col gap-1.5 overflow-hidden sm:gap-2 sm:p-3",
            !img && !(showTitle && title) && "[@media(pointer:fine)]:pt-10",
          )}
        >
          {showTitle && title && (
            <div
              className={cn(
                "line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-sm font-semibold leading-snug tracking-tight sm:text-lg",
                !img &&
                  "[@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:pl-9",
              )}
            >
              {title}
            </div>
          )}
          {content && (
            <div className="shrink-1 max-h-32 overflow-hidden text-xs leading-4 text-foreground/90 sm:max-h-40 sm:text-sm sm:leading-5">
              {content}
            </div>
          )}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags &&
            (bookmark.tags.length > 0 || isBookmarkStillTagging(bookmark)) && (
              <div className="hidden shrink-0 flex-wrap gap-1.5 sm:flex">
                <TagList
                  className={wrapTags ? undefined : "h-full"}
                  bookmark={bookmark}
                  loading={isBookmarkStillTagging(bookmark)}
                />
              </div>
            )}
        </div>
        {/* Footer. Mobile: url on its own row, then date + actions share one
            row (date left, actions right). Desktop: url + date inline on the
            left, actions on the right. The date is rendered in both spots and
            toggled per breakpoint since it regroups between the two. */}
        <div className="flex w-full shrink-0 flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:border-t sm:border-border/60 sm:px-3 sm:py-1.5 sm:text-sm">
          <div
            className={cn(
              "flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2",
              !(sourceUrl || footer) && "hidden sm:flex",
            )}
          >
            {(sourceUrl || footer) && (
              <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-nowrap">
                {sourceUrl && (
                  <Favicon
                    url={sourceUrl}
                    storedFavicon={storedFavicon}
                    allowRemoteFallback={true}
                    className="size-3.5 shrink-0 sm:size-4"
                  />
                )}
                {footer}
              </div>
            )}
            <Link
              href={`/dashboard/preview/${bookmark.id}`}
              suppressHydrationWarning
              className="ease-(--ease-out) hidden text-nowrap transition-colors duration-150 hover:text-foreground sm:block"
            >
              <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
            </Link>
          </div>
          <div className="flex items-center justify-between gap-0.5 sm:justify-end sm:gap-2">
            <Link
              href={`/dashboard/preview/${bookmark.id}`}
              suppressHydrationWarning
              className="ease-(--ease-out) text-nowrap transition-colors duration-150 hover:text-foreground sm:hidden"
            >
              <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
            </Link>
            <div className="shrink-0 [&_a]:size-7 sm:[&_a]:size-8 [&_button]:size-7 sm:[&_button]:size-8 [&_svg]:size-3.5 sm:[&_svg]:size-4">
              <BookmarkActionBar bookmark={bookmark} alwaysVisibleOnDesktop />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactView({
  bookmark,
  title,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showTitle } = useBookmarkDisplaySettings();
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl",
        className,
        "max-h-96",
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <MultiBookmarkSelector bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      <BookmarkDragHandle
        bookmark={bookmark}
        className="left-1 top-1/2 -translate-y-1/2"
      />
      <div className="flex h-full items-center justify-between gap-3 overflow-hidden p-3 [@media(pointer:fine)]:pl-11">
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
          {bookmark.content.type === BookmarkTypes.LINK && (
            <Favicon
              url={bookmark.content.url}
              storedFavicon={bookmark.content.favicon}
              allowRemoteFallback={true}
              className="size-5"
            />
          )}
          {bookmark.content.type === BookmarkTypes.TEXT && (
            <NotebookPen className="size-5" />
          )}
          {bookmark.content.type === BookmarkTypes.ASSET &&
            (bookmark.content.assetType === "video" ? (
              <Video className="size-5" aria-hidden="true" />
            ) : bookmark.content.assetType === "audio" ? (
              <AudioLines className="size-5" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-5" aria-hidden="true" />
            ))}
          {showTitle && (
            <div className="shrink-1 line-clamp-1 overflow-hidden text-ellipsis break-words text-sm font-semibold tracking-tight">
              {title ?? "Untitled"}
            </div>
          )}
          {footer && (
            <p className="flex min-w-0 shrink gap-2 overflow-hidden text-xs text-muted-foreground">
              <span aria-hidden>•</span>
              <span className="truncate">{footer}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">•</p>
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            suppressHydrationWarning
            className="ease-(--ease-out) shrink-0 gap-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </Link>
        </div>
        <BookmarkActionBar bookmark={bookmark} />
      </div>
    </div>
  );
}

export function BookmarkLayoutAdaptingCard(props: Props) {
  const layout = useBookmarkLayout();

  return bookmarkLayoutSwitch(layout, {
    masonry: <GridView layout={layout} {...props} />,
    grid: <GridView layout={layout} {...props} />,
    list: <ListView {...props} />,
    compact: <CompactView {...props} />,
  });
}
