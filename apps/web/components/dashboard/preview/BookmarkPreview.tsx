"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkTagsEditor } from "@/components/dashboard/bookmarks/BookmarkTagsEditor";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import useRelativeTime from "@/lib/hooks/relative-time";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Building,
  CalendarDays,
  ExternalLink,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  User,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import SummarizeBookmarkArea from "../bookmarks/SummarizeBookmarkArea";
import Favicon from "../bookmarks/Favicon";
import ActionBar from "./ActionBar";
import { AssetContentSection } from "./AssetContentSection";
import AttachmentBox from "./AttachmentBox";
import ContentDownloadButton from "./ContentDownloadButton";
import HighlightsBox from "./HighlightsBox";
import LinkContentSection from "./LinkContentSection";
import { NoteEditor } from "./NoteEditor";
import { TextContentSection } from "./TextContentSection";

function getDisplayUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hasRoute =
      parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash;
    return `${parsedUrl.protocol}//${parsedUrl.host}${hasRoute ? "/..." : ""}`;
  } catch {
    return url;
  }
}

function ContentLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-border/70 bg-card/60 p-8 text-center">
      <Globe className="h-10 w-10 animate-pulse text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("preview.crawling_in_progress")}
      </p>
    </div>
  );
}

function CreationTime({ createdAt }: { createdAt: Date }) {
  const { i18n } = useTranslation();
  const { localCreatedAt } = useRelativeTime(createdAt, i18n.language);
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex w-full items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} /> {localCreatedAt}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{localCreatedAt}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("w-full", className)}>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function BookmarkMetadata({ bookmark }: { bookmark: ZBookmark }) {
  let { author, publisher, datePublished } =
    bookmark.content.type !== BookmarkTypes.LINK
      ? {
          author: null,
          publisher: null,
          datePublished: null,
        }
      : bookmark.content;

  return (
    <div className="flex w-full flex-col gap-2.5">
      <CreationTime createdAt={bookmark.createdAt} />
      {author && (
        <div className="flex w-full items-center gap-2 text-sm text-muted-foreground">
          <User size={16} />
          <span>By {author}</span>
        </div>
      )}
      {publisher && (
        <div className="flex w-full items-center gap-2 text-sm text-muted-foreground">
          <Building size={16} />
          <span>{publisher}</span>
        </div>
      )}
      {datePublished && <PublishedDate datePublished={datePublished} />}
    </div>
  );
}

function PublishedDate({ datePublished }: { datePublished: Date }) {
  const { i18n } = useTranslation();
  const { localCreatedAt } = useRelativeTime(datePublished, i18n.language);
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="flex w-full items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} />
          <span>Published {localCreatedAt}</span>
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{localCreatedAt}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function BookmarkPreview({
  bookmarkId,
  initialData,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
  onClose?: () => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("content");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { data: session } = useSession();

  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId,
      },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) {
            return false;
          }
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  // Check if the current user owns this bookmark
  const isOwner = session?.user?.id === bookmark.userId;

  let content;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK: {
      content = <LinkContentSection bookmark={bookmark} />;
      break;
    }
    case BookmarkTypes.TEXT: {
      content = <TextContentSection bookmark={bookmark} />;
      break;
    }
    case BookmarkTypes.ASSET: {
      content = <AssetContentSection bookmark={bookmark} />;
      break;
    }
  }

  const sourceUrl = getSourceUrl(bookmark);
  const displaySourceUrl = sourceUrl ? getDisplayUrl(sourceUrl) : null;
  const storedFavicon =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.favicon
      : null;
  const title = getBookmarkTitle(bookmark);
  const isPdfPreview =
    bookmark.content.type === BookmarkTypes.ASSET &&
    bookmark.content.assetType === "pdf";
  const isTextPreview = bookmark.content.type === BookmarkTypes.TEXT;
  const isLinkPreview = bookmark.content.type === BookmarkTypes.LINK;
  const isImageOrVideoPreview =
    bookmark.content.type === BookmarkTypes.ASSET &&
    (bookmark.content.assetType === "image" ||
      bookmark.content.assetType === "video");
  const videoFileName =
    bookmark.content.type === BookmarkTypes.ASSET &&
    bookmark.content.assetType === "video"
      ? (bookmark.content.fileName ?? t("common.video"))
      : undefined;

  // Common content for both layouts
  const contentSection = isBookmarkStillCrawling(bookmark) ? (
    <ContentLoading />
  ) : (
    content
  );

  const detailsSection = (
    <div className="flex w-full flex-col gap-3">
      <div className="mb-0 w-full lg:mb-1 xl:mb-2">
        <div className="flex w-full flex-col gap-1.5">
          <p className="line-clamp-3 w-full text-ellipsis break-words text-xl font-semibold leading-snug tracking-tight text-foreground">
            {!title ? "Untitled" : title}
          </p>
          {sourceUrl && displaySourceUrl && (
            <Link
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              title={sourceUrl}
              className="ease-(--ease-out) inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-foreground transition-colors duration-150 hover:text-foreground/80"
            >
              <Favicon
                url={sourceUrl}
                storedFavicon={storedFavicon}
                className="size-4 shrink-0"
              />
              <span className="min-w-0 truncate underline underline-offset-4">
                {displaySourceUrl}
              </span>
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <DetailSection title="Metadata">
        <BookmarkMetadata bookmark={bookmark} />
      </DetailSection>
      <DetailSection title="Summary">
        {bookmark.summary ? (
          <SummarizeBookmarkArea bookmark={bookmark} readOnly={!isOwner} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">(None)</p>
            <SummarizeBookmarkArea bookmark={bookmark} readOnly={!isOwner} />
          </>
        )}
      </DetailSection>
      <DetailSection title={t("common.tags")}>
        <BookmarkTagsEditor bookmark={bookmark} disabled={!isOwner} />
      </DetailSection>
      <DetailSection title={t("common.note")}>
        <NoteEditor bookmark={bookmark} disabled={!isOwner} />
      </DetailSection>
      <AttachmentBox bookmark={bookmark} readOnly={!isOwner} />
      <HighlightsBox bookmarkId={bookmark.id} readOnly={!isOwner} />
      {isOwner && (
        <DetailSection title="Actions">
          <ActionBar bookmark={bookmark} />
        </DetailSection>
      )}
    </div>
  );

  return (
    <>
      {/* Render original layout for wide screens */}
      <div className="hidden h-full flex-col overflow-hidden bg-muted/10 lg:flex">
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "relative h-full min-w-0 flex-1 overflow-hidden",
              isPdfPreview ? "" : "px-6 xl:px-8",
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-center px-5",
                !isPdfPreview &&
                  !isLinkPreview &&
                  "bg-background/45 backdrop-blur-xl supports-[backdrop-filter]:bg-background/35",
              )}
            >
              {isTextPreview && (
                <Link
                  href={`/reader/${bookmark.id}`}
                  className={cn(
                    "pointer-events-auto",
                    buttonVariants({ variant: "outline", size: "default" }),
                  )}
                  aria-label={t("preview.reader_view")}
                >
                  <BookOpen className="mr-2 size-4" aria-hidden="true" />
                  {t("preview.reader_view")}
                </Link>
              )}
              {isImageOrVideoPreview && (
                <ContentDownloadButton
                  bookmark={bookmark}
                  fileName={videoFileName}
                  size="default"
                  className="pointer-events-auto"
                />
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="ease-(--ease-out) hover:shadow-xs focus-visible:shadow-xs pointer-events-auto absolute right-5 top-2 inline-flex size-10 items-center justify-center rounded-full border border-transparent bg-transparent p-0 text-muted-foreground shadow-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 hover:border-border/70 hover:bg-background/90 hover:text-foreground focus-visible:bg-background/90 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100"
                aria-label={t(
                  sidebarCollapsed
                    ? "actions.show_details"
                    : "actions.hide_details",
                )}
                aria-expanded={!sidebarCollapsed}
              >
                {sidebarCollapsed ? (
                  <PanelRightOpen size={20} aria-hidden="true" />
                ) : (
                  <PanelRightClose size={20} aria-hidden="true" />
                )}
              </button>
            </div>
            <div
              className={cn(
                "h-full min-h-0 w-full min-w-0",
                isPdfPreview ? "overflow-hidden pt-2" : "overflow-hidden",
              )}
            >
              <div
                className={cn(
                  "h-full min-h-0",
                  !isPdfPreview &&
                    !isLinkPreview &&
                    bookmark.content.type !== BookmarkTypes.TEXT &&
                    "pt-14",
                )}
              >
                {contentSection}
              </div>
            </div>
          </div>
          {!sidebarCollapsed && (
            <div className="flex w-[24rem] shrink-0 flex-col gap-3 overflow-auto border-l border-border/70 bg-card/55 p-4 xl:w-[26rem] xl:p-5">
              {detailsSection}
            </div>
          )}
        </div>
      </div>
      {/* Render tabbed layout for narrow/vertical screens */}
      <div className="flex h-full w-full flex-col overflow-hidden lg:hidden">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="sticky top-0 z-10 bg-background/95 px-2 pb-1.5 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg border border-border/70 bg-card/80 p-1">
              <TabsTrigger value="content">
                {t("preview.tabs.content")}
              </TabsTrigger>
              <TabsTrigger value="details">
                {t("preview.tabs.details")}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="content"
            className={cn(
              "h-full min-h-0 flex-1 bg-background data-[state=inactive]:hidden",
              isPdfPreview
                ? "mt-0 overflow-hidden px-0 pb-2 pt-0"
                : "overflow-hidden overflow-y-auto px-2 py-2",
            )}
          >
            {contentSection}
          </TabsContent>
          <TabsContent
            value="details"
            className="h-full overflow-y-auto bg-muted/10 px-3 py-2 data-[state=inactive]:hidden"
          >
            {detailsSection}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
