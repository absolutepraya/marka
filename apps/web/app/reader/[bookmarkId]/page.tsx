"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import HighlightCard from "@/components/dashboard/highlights/HighlightCard";
import ReaderSettingsPopover from "@/components/dashboard/preview/ReaderSettingsPopover";
import ReaderView from "@/components/dashboard/preview/ReaderView";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  ExternalLink,
  Globe,
  HighlighterIcon as Highlight,
  Printer,
  UserRound,
  X,
} from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

export default function ReaderViewPage() {
  const api = useTRPC();
  const params = useParams<{ bookmarkId: string }>();
  const bookmarkId = params.bookmarkId;
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId,
    }),
  );
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId,
    }),
  );

  const { data: session } = useSession();
  const router = useRouter();
  const { t } = useTranslation();
  const { settings } = useReaderSettings();
  const [showHighlights, setShowHighlights] = useState(false);
  const [needsReviewState, setNeedsReviewState] = useState<{
    contentKey: string;
    ids: Set<string>;
  }>({ contentKey: "", ids: new Set() });
  const isOwner = session?.user?.id === bookmark?.userId;
  const canUseReader =
    bookmark?.content.type === BookmarkTypes.TEXT ||
    bookmark?.content.type === BookmarkTypes.LINK;
  const canHighlight = bookmark?.content.type === BookmarkTypes.LINK;
  const readerContentKey =
    bookmark?.content.type === BookmarkTypes.LINK ? `${bookmarkId}:html` : "";
  const needsReviewHighlightIds =
    needsReviewState.contentKey === readerContentKey
      ? needsReviewState.ids
      : new Set<string>();

  const onClose = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const sourceUrl =
    bookmark?.content.type === BookmarkTypes.LINK ? bookmark.content.url : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background/92 sticky top-0 z-40 border-b border-border/70 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={onClose}
              aria-label={t("actions.close_reader")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <p className="truncate whitespace-nowrap text-sm font-medium text-foreground">
                {t("preview.reader_view")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {bookmark
                  ? getBookmarkTitle(bookmark)
                  : t("preview.loading_article")}
              </p>
            </div>
          </div>

          <div className="shadow-xs flex items-center gap-0 rounded-lg border border-border/70 bg-card/80 p-0">
            {sourceUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md"
                asChild
              >
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("actions.open_original")}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
            {canUseReader && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-md"
                onClick={handlePrint}
                aria-label={t("actions.print")}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}

            {canUseReader && <ReaderSettingsPopover variant="ghost" />}

            {canHighlight && (
              <Button
                variant={showHighlights ? "default" : "ghost"}
                size="icon"
                className="rounded-md"
                onClick={() => setShowHighlights(!showHighlights)}
                aria-label={t(
                  showHighlights
                    ? "actions.hide_highlights"
                    : "actions.show_highlights",
                )}
                aria-pressed={showHighlights}
              >
                <Highlight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex overflow-hidden">
        {/* Mobile backdrop */}
        {showHighlights && (
          <button
            type="button"
            className="fixed inset-0 top-14 z-40 bg-black/50 lg:hidden"
            onClick={() => setShowHighlights(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowHighlights(false);
              }
            }}
            aria-label={t("actions.close_highlights")}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden">
          <article className="reader-fullscreen-article mx-auto max-w-[46rem] overflow-x-hidden px-4 py-4 sm:px-6 sm:py-10">
            {bookmark ? (
              <>
                {/* Article Header */}
                <header className="reader-fullscreen-header shadow-xs mb-4 space-y-2 rounded-xl border border-border/70 bg-card/50 p-3 sm:mb-6 sm:space-y-3 sm:rounded-2xl sm:p-5">
                  <h1
                    className="reader-fullscreen-title font-bold leading-tight"
                    style={{
                      fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                      fontSize: `${settings.fontSize * 1.8}px`,
                      lineHeight: settings.lineHeight * 0.9,
                    }}
                  >
                    {getBookmarkTitle(bookmark)}
                  </h1>
                  <div className="reader-fullscreen-metadata flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground sm:gap-x-4 sm:gap-y-2">
                    {bookmark.content.type == BookmarkTypes.LINK &&
                      bookmark.content.author && (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-medium">By</span>
                          <span className="text-sm text-foreground/80">
                            {bookmark.content.author}
                          </span>
                        </span>
                      )}
                    {bookmark.content.type == BookmarkTypes.LINK &&
                      bookmark.content.publisher && (
                        <span className="inline-flex items-center gap-1.5">
                          <Globe
                            className="size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{bookmark.content.publisher}</span>
                        </span>
                      )}
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpenCheck
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{t("preview.saved_for_focused_reading")}</span>
                    </span>
                  </div>
                </header>

                {/* Article Content */}
                <Suspense fallback={<FullPageSpinner />}>
                  <div className="overflow-x-hidden">
                    <ReaderView
                      className="reader-fullscreen-content"
                      style={{
                        fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                      bookmarkId={bookmarkId}
                      readOnly={!isOwner}
                      fallbackHref={`/dashboard/preview/${bookmarkId}`}
                      progressBarStyle={{ position: "fixed", top: "3.5rem" }}
                      onHighlightNeedsReview={(highlightId, contentKey) =>
                        setNeedsReviewState((current) => {
                          if (current.contentKey !== contentKey) {
                            return {
                              contentKey,
                              ids: new Set([highlightId]),
                            };
                          }
                          if (current.ids.has(highlightId)) return current;
                          return {
                            contentKey,
                            ids: new Set(current.ids).add(highlightId),
                          };
                        })
                      }
                    />
                  </div>
                </Suspense>
              </>
            ) : (
              <FullPageSpinner />
            )}
          </article>
        </main>

        {/* Highlights Sidebar */}
        {canHighlight && (highlights || showHighlights) && (
          <aside
            aria-hidden={!showHighlights}
            inert={!showHighlights ? true : undefined}
            className={cn(
              "ease-(--ease-out) fixed right-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-full border-l border-border/70 bg-card/95 transition-[transform,opacity] duration-200 motion-reduce:transform-none motion-reduce:transition-none sm:w-80 lg:bg-card/85 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-card/75 print:hidden",
              showHighlights
                ? "translate-x-0 opacity-100"
                : "pointer-events-none translate-x-full opacity-0",
            )}
          >
            <div className="flex h-full flex-col">
              <div className="border-b border-border/70 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{t("common.highlights")}</h2>
                  <div className="flex items-center gap-2">
                    {highlights && (
                      <span className="text-sm text-muted-foreground">
                        {t("preview.highlights_saved", {
                          count: highlights.highlights.length,
                        })}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 lg:hidden"
                      onClick={() => setShowHighlights(false)}
                      aria-label={t("actions.close_highlights")}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {highlights ? (
                  <div className="space-y-4">
                    {highlights.highlights.map((highlight) => (
                      <HighlightCard
                        key={highlight.id}
                        highlight={highlight}
                        clickable={!needsReviewHighlightIds.has(highlight.id)}
                        readOnly={!isOwner}
                        needsReview={needsReviewHighlightIds.has(highlight.id)}
                      />
                    ))}
                  </div>
                ) : (
                  showHighlights && <FullPageSpinner />
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
