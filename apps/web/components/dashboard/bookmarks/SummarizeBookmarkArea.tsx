import React from "react";
import { ActionButton } from "@/components/ui/action-button";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ChevronUp, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

function AISummary({
  bookmarkId,
  summary,
  readOnly = false,
}: {
  bookmarkId: string;
  summary: string;
  readOnly?: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { mutate: resummarize, isPending: isResummarizing } =
    useSummarizeBookmark({
      onError: () => {
        toast({
          description: "Something went wrong",
          variant: "destructive",
        });
      },
    });
  const { mutate: updateBookmark, isPending: isUpdatingBookmark } =
    useUpdateBookmark({
      onError: () => {
        toast({
          description: "Something went wrong",
          variant: "destructive",
        });
      },
    });
  return (
    <div className="w-full">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={`ease-(--ease-out) relative w-full transition-shadow duration-200 ${isExpanded ? "h-auto" : "cursor-pointer"}`}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        <MarkdownReadonly
          className={`w-full text-sm ${!isExpanded && "line-clamp-3"}`}
        >
          {summary}
        </MarkdownReadonly>
        {isExpanded && (
          <span className="flex justify-end gap-2 pt-2">
            {!readOnly && (
              <>
                <ActionButton
                  variant="none"
                  size="none"
                  spinner={<LoadingSpinner className="size-4" />}
                  className="rounded-full bg-muted p-1 text-muted-foreground"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                  loading={isResummarizing}
                  onClick={() => resummarize({ bookmarkId })}
                >
                  <RefreshCw size={16} />
                </ActionButton>
                <ActionButton
                  size="none"
                  variant="none"
                  spinner={<LoadingSpinner className="size-4" />}
                  className="rounded-full bg-muted p-1 text-muted-foreground"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                  loading={isUpdatingBookmark}
                  onClick={() => updateBookmark({ bookmarkId, summary: null })}
                >
                  <Trash2 size={16} />
                </ActionButton>
              </>
            )}
            <button
              type="button"
              className="rounded-full bg-muted p-1 text-muted-foreground"
              aria-label="Collapse"
              onClick={() => setIsExpanded(false)}
            >
              <ChevronUp size={16} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function SummarizeBookmarkArea({
  bookmark,
  readOnly = false,
}: {
  bookmark: ZBookmark;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate, isPending } = useSummarizeBookmark({
    onError: () => {
      toast({
        description: "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const clientConfig = useClientConfig();
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  if (bookmark.summary) {
    return (
      <AISummary
        bookmarkId={bookmark.id}
        summary={bookmark.summary}
        readOnly={readOnly}
      />
    );
  } else if (!clientConfig.inference.isConfigured || readOnly) {
    return null;
  } else {
    return (
      <div className="flex w-full items-center gap-4">
        <ActionButton
          onClick={() => mutate({ bookmarkId: bookmark.id })}
          variant="secondary"
          className={cn(
            `ease-(--ease-out) w-full text-muted-foreground transition-colors duration-150 hover:text-foreground`,
          )}
          loading={isPending}
        >
          <span className="flex items-center gap-1.5">
            {t("actions.summarize_with_ai")}
            <Sparkles className="size-4" />
          </span>
        </ActionButton>
      </div>
    );
  }
}
