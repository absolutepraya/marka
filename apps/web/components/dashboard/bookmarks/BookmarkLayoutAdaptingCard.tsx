"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { ReactNode } from "react";
import { useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth/client";
import {
  BOOKMARK_DRAG_MIME,
  BOOKMARK_SOURCE_LIST_MIME,
} from "@/lib/bookmark-drag";
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
  GripVertical,
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

  // Don't show selector for non-owned bookmarks or when bulk edit is disabled
  const isOwner = session?.user?.id === bookmark.userId;
  if (!isBulkEditEnabled || !isOwner) return null;

  return (
    <button
      type="button"
      className={cn(
        "absolute left-0 top-0 z-50 h-full w-full transition-colors",
        isSelected ? "bg-foreground/10" : "bg-transparent",
      )}
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

function DragHandle({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { isBulkEditEnabled } = useBulkActionsStore();
  // The list this card is currently being viewed in, if any. When it's a manual
  // list, dropping onto another list becomes a move (remove from here) rather
  // than a copy.
  const listContext = useBookmarkListContext();
  const sourceListId =
    listContext?.type === "manual" ? listContext.id : undefined;
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(BOOKMARK_DRAG_MIME, bookmark.id);
      if (sourceListId) {
        e.dataTransfer.setData(BOOKMARK_SOURCE_LIST_MIME, sourceListId);
        // Allow the drop target to choose "move" (remove from the source list).
        e.dataTransfer.effectAllowed = "copyMove";
      } else {
        e.dataTransfer.effectAllowed = "copy";
      }

      // Create a small pill element as the drag preview
      const pill = document.createElement("div");
      const title = getBookmarkTitle(bookmark) ?? "Untitled";
      pill.textContent =
        title.length > 40 ? title.substring(0, 40) + "\u2026" : title;
      Object.assign(pill.style, {
        position: "fixed",
        left: "-9999px",
        top: "-9999px",
        padding: "6px 12px",
        borderRadius: "8px",
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "13px",
        fontFamily: "inherit",
        color: "hsl(var(--foreground))",
        maxWidth: "240px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      document.body.appendChild(pill);
      e.dataTransfer.setDragImage(pill, 0, 0);
      requestAnimationFrame(() => pill.remove());
    },
    [bookmark, sourceListId],
  );

  if (isBulkEditEnabled) return null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "absolute z-40 hidden cursor-grab rounded bg-background/70 p-0.5 opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 [@media(pointer:fine)]:block",
        className,
      )}
    >
      <GripVertical className="size-4 text-muted-foreground" />
    </div>
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
      <DragHandle
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
      <DragHandle bookmark={bookmark} className="left-2 top-2" />
      {img && (
        <div className="aspect-square w-full shrink-0 overflow-hidden border-b border-border/60 bg-muted/20 sm:aspect-auto sm:h-56 sm:min-h-56">
          {img}
        </div>
      )}
      <div className="flex h-full flex-col justify-between gap-1 overflow-hidden p-2 pb-1 sm:gap-2.5 sm:p-3.5">
        <div className="grow-1 flex flex-col gap-1.5 overflow-hidden sm:gap-2">
          {showTitle && title && (
            <div className="line-clamp-2 flex-none shrink-0 overflow-hidden text-ellipsis break-words text-sm font-semibold leading-snug tracking-tight sm:text-lg">
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
        <div className="flex w-full shrink-0 flex-col gap-0.5 border-t border-border/60 pt-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:pt-2.5 sm:text-sm">
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
      <div className="flex h-full items-center justify-between gap-3 overflow-hidden p-3">
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
