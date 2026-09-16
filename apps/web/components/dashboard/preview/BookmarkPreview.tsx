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
  Building,
  CalendarDays,
  ExternalLink,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  User,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getBookmarkTitle,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

import SummarizeBookmarkArea from "../bookmarks/SummarizeBookmarkArea";
import ActionBar from "./ActionBar";
import { AssetContentSection } from "./AssetContentSection";
import AttachmentBox from "./AttachmentBox";
import HighlightsBox from "./HighlightsBox";
import LinkContentSection from "./LinkContentSection";
import { NoteEditor } from "./NoteEditor";
import { TextContentSection } from "./TextContentSection";

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
  const { fromNow, localCreatedAt } = useRelativeTime(createdAt, i18n.language);
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} /> {fromNow}
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
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-background/80 px-3 py-3",
        className,
      )}
    >
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
    <div className="flex flex-col gap-2.5">
      <CreationTime createdAt={bookmark.createdAt} />
      {author && (
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <User size={16} />
          <span>By {author}</span>
        </div>
      )}
      {publisher && (
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
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
  const { fromNow, localCreatedAt } = useRelativeTime(
    datePublished,
    i18n.language,
  );
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} />
          <span>Published {fromNow}</span>
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
  const title = getBookmarkTitle(bookmark);
  const isPdfPreview =
    bookmark.content.type === BookmarkTypes.ASSET &&
    bookmark.content.assetType === "pdf";

  // Common content for both layouts
  const contentSection = isBookmarkStillCrawling(bookmark) ? (
    <ContentLoading />
  ) : (
    content
  );

  const detailsSection = (
    <div className="flex flex-col gap-3">
      <div className="shadow-xs rounded-2xl border border-border/70 bg-background/90 p-4">
        <div className="flex flex-col gap-1.5">
          <p className="line-clamp-3 text-ellipsis break-words text-xl font-semibold leading-snug tracking-tight text-foreground">
            {!title ? "Untitled" : title}
          </p>
          {sourceUrl && (
            <Link
              href={sourceUrl}
              target="_blank"
              className="ease-(--ease-out) inline-flex w-fit items-center gap-1 rounded-full border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-[background-color,color,border-color] duration-150 hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              <span>{t("preview.view_original")}</span>
            </Link>
          )}
        </div>
      </div>
      <DetailSection title="Metadata">
        <BookmarkMetadata bookmark={bookmark} />
      </DetailSection>
      <DetailSection title="Summary">
        <SummarizeBookmarkArea bookmark={bookmark} readOnly={!isOwner} />
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
              "relative h-full min-w-0 flex-1",
              isPdfPreview
                ? "overflow-hidden pt-2"
                : "overflow-auto px-6 py-5 xl:px-8 xl:py-6",
            )}
          >
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn(
                "ease-(--ease-out) hover:shadow-xs focus-visible:shadow-xs absolute right-5 top-5 z-10 inline-flex items-center justify-center rounded-full border border-transparent bg-transparent p-2 text-muted-foreground shadow-none transition-[background-color,color,border-color,box-shadow,transform] duration-150 hover:border-border/70 hover:bg-background/90 hover:text-foreground focus-visible:bg-background/90 active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100",
                isPdfPreview && "top-2 size-10 p-0",
              )}
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
            {contentSection}
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
          <div
            className={cn(
              "sticky top-0 z-10 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
              isPdfPreview ? "pb-2 pt-2" : "pb-2 pt-3",
            )}
          >
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-border/70 bg-card/80 p-1">
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
                : "overflow-hidden overflow-y-auto px-4 py-3",
            )}
          >
            {contentSection}
          </TabsContent>
          <TabsContent
            value="details"
            className="h-full overflow-y-auto bg-muted/10 px-4 py-3 data-[state=inactive]:hidden"
          >
            {detailsSection}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
