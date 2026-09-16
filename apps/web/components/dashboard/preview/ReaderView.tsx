import Link from "next/link";
import { useRef } from "react";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileX, RotateCw } from "lucide-react";

import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import ReadingProgressBanner from "./ReadingProgressBanner";
import ReaderNavigation from "./ReaderNavigation";
import { sanitizeReaderHtml } from "@/lib/reader-html";

function ReaderState({
  title,
  description,
  fallbackHref,
  onRetry,
  retryLabel,
  openPreviewLabel,
}: {
  title: string;
  description: string;
  fallbackHref?: string;
  onRetry?: () => void;
  retryLabel: string;
  openPreviewLabel: string;
}) {
  return (
    <div
      className="flex min-h-64 w-full items-center justify-center p-4"
      role={onRetry ? "alert" : "status"}
    >
      <div className="max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileX
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {(onRetry || fallbackHref) && (
          <div className="flex flex-wrap justify-center gap-2">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                <RotateCw className="mr-2 size-4" aria-hidden="true" />
                {retryLabel}
              </Button>
            )}
            {fallbackHref && (
              <Button asChild>
                <Link href={fallbackHref}>{openPreviewLabel}</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReaderTextContent({
  text,
  format,
  className,
  style,
}: {
  text: string;
  format?: "markdown" | "plain";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "prose prose-neutral max-w-none break-words dark:prose-invert [&_code]:break-all [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto",
        className,
      )}
      style={style}
    >
      {(format ?? "markdown") === "plain" ? (
        <div className="font-sans">
          {text.split("\n").map((line, index, lines) => (
            <span
              key={index}
              data-reading-block
              className="block whitespace-pre-wrap break-words"
            >
              {line}
              {index < lines.length - 1 ? "\n" : null}
            </span>
          ))}
        </div>
      ) : (
        <MarkdownReadonly allowTodoToggle={false}>{text}</MarkdownReadonly>
      )}
    </div>
  );
}

export default function ReaderView({
  bookmarkId,
  className,
  style,
  readOnly,
  progressBarStyle,
  fallbackHref,
  onHighlightNeedsReview,
}: {
  bookmarkId: string;
  className?: string;
  style?: React.CSSProperties;
  readOnly: boolean;
  progressBarStyle?: React.CSSProperties;
  fallbackHref?: string;
  onHighlightNeedsReview?: (highlightId: string, contentKey: string) => void;
}) {
  const { t } = useTranslation();
  const readerContentRef = useRef<HTMLDivElement>(null);
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const {
    data: bookmark,
    isPending: isBookmarkLoading,
    isError: isBookmarkError,
    refetch: refetchBookmark,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId,
      includeContent: true,
    }),
  );

  const {
    showBanner,
    bannerPercent,
    isRestarted,
    onContinue,
    onStartOver,
    onUndoStartOver,
    onDismiss,
    progressActionPending,
    restorePosition,
    resetPosition,
    readingProgressOffset,
    readingProgressAnchor,
    readingProgressPercent,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId,
  });

  const { mutate: createHighlight } = useCreateHighlight({
    onSuccess: () => {
      toast({
        description: t("actions.highlight_created"),
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutate: updateHighlight } = useUpdateHighlight({
    onSuccess: () => {
      toast({
        description: t("actions.highlight_updated"),
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutate: deleteHighlight } = useDeleteHighlight({
    onSuccess: () => {
      toast({
        description: t("actions.highlight_deleted"),
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const renderTrackedReader = (
    readerContent: React.ReactNode,
    contentKey: string,
  ) => (
    <ScrollProgressTracker
      onSavePosition={onSavePosition}
      onScrollPositionChange={onScrollPositionChange}
      restorePosition={restorePosition}
      resetPosition={resetPosition}
      readingProgressOffset={readingProgressOffset}
      readingProgressAnchor={readingProgressAnchor}
      readingProgressPercent={readingProgressPercent}
      showProgressBar
      progressBarStyle={progressBarStyle}
    >
      {showBanner && (
        <ReadingProgressBanner
          percent={bannerPercent}
          isRestarted={isRestarted}
          actionPending={progressActionPending}
          onContinue={onContinue}
          onStartOver={onStartOver}
          onUndoStartOver={onUndoStartOver}
          onDismiss={onDismiss}
        />
      )}
      <ReaderNavigation contentRef={readerContentRef} contentKey={contentKey} />
      <div ref={readerContentRef}>{readerContent}</div>
    </ScrollProgressTracker>
  );

  const renderHighlightedReader = (htmlContent: string, sourceUrl: string) => {
    const safeHtmlContent = sanitizeReaderHtml(htmlContent, sourceUrl);
    const contentKey = `${bookmarkId}:html:${safeHtmlContent}`;
    const reviewContentKey = `${bookmarkId}:html`;

    return renderTrackedReader(
      <BookmarkHTMLHighlighter
        className={className}
        style={style}
        htmlContent={safeHtmlContent}
        highlights={highlights?.highlights ?? []}
        readOnly={readOnly}
        onDeleteHighlight={(h) =>
          deleteHighlight({
            highlightId: h.id,
          })
        }
        onUpdateHighlight={(h) =>
          updateHighlight({
            highlightId: h.id,
            color: h.color,
            note: h.note,
          })
        }
        onHighlight={(h) =>
          createHighlight({
            startOffset: h.startOffset,
            endOffset: h.endOffset,
            color: h.color,
            bookmarkId,
            text: h.text,
            contextBefore: h.contextBefore ?? null,
            contextAfter: h.contextAfter ?? null,
            note: h.note ?? null,
          })
        }
        onHighlightNeedsReview={(h) =>
          onHighlightNeedsReview?.(h.id, reviewContentKey)
        }
      />,
      contentKey,
    );
  };

  let content: React.ReactNode;
  if (isBookmarkLoading) {
    content = <FullPageSpinner />;
  } else if (isBookmarkError || !bookmark) {
    content = (
      <ReaderState
        title={t("preview.reader_view_unavailable_title")}
        description={t("preview.reader_view_unavailable_description")}
        fallbackHref={fallbackHref}
        onRetry={() => void refetchBookmark()}
        retryLabel={t("preview.retry")}
        openPreviewLabel={t("preview.open_preview")}
      />
    );
  } else if (bookmark.content.type === BookmarkTypes.TEXT) {
    content = renderTrackedReader(
      <ReaderTextContent
        text={bookmark.content.text}
        format={bookmark.content.format}
        className={className}
        style={style}
      />,
      `${bookmarkId}:text:${bookmark.content.format ?? "markdown"}:${bookmark.content.text}`,
    );
  } else if (bookmark.content.type === BookmarkTypes.LINK) {
    if (bookmark.content.crawlStatus === "pending") {
      content = (
        <ReaderState
          title={t("preview.reader_view_not_ready_title")}
          description={t("preview.crawling_in_progress")}
          fallbackHref={fallbackHref}
          retryLabel={t("preview.retry")}
          openPreviewLabel={t("preview.open_preview")}
        />
      );
    } else if (bookmark.content.crawlStatus === "failure") {
      content = (
        <ReaderState
          title={t("preview.fetch_error_title")}
          description={t("preview.fetch_error_description")}
          fallbackHref={fallbackHref}
          retryLabel={t("preview.retry")}
          openPreviewLabel={t("preview.open_preview")}
        />
      );
    } else if (!bookmark.content.htmlContent) {
      content = (
        <ReaderState
          title={t("preview.no_readable_content_title")}
          description={t("preview.no_readable_content_description")}
          fallbackHref={fallbackHref}
          retryLabel={t("preview.retry")}
          openPreviewLabel={t("preview.open_preview")}
        />
      );
    } else {
      content = renderHighlightedReader(
        bookmark.content.htmlContent,
        bookmark.content.url,
      );
    }
  } else {
    content = (
      <ReaderState
        title={t("preview.reader_view_not_available_title")}
        description={t("preview.reader_view_not_available_description")}
        fallbackHref={fallbackHref}
        retryLabel={t("preview.retry")}
        openPreviewLabel={t("preview.open_preview")}
      />
    );
  }

  return content;
}
