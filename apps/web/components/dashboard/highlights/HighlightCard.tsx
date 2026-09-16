import { ActionButton } from "@/components/ui/action-button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { ZHighlight } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";

function HighlightWrapper({
  clickable,
  onClick,
  className,
  children,
}: {
  clickable: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return clickable ? (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

export default function HighlightCard({
  highlight,
  clickable,
  className,
  readOnly,
  needsReview = false,
}: {
  highlight: ZHighlight;
  clickable: boolean;
  className?: string;
  readOnly: boolean;
  needsReview?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate: deleteHighlight, isPending: isDeleting } = useDeleteHighlight(
    {
      onSuccess: () => {
        toast({
          description: "Highlight has been deleted!",
        });
      },
      onError: () => {
        toast({
          description: "Something went wrong",
          variant: "destructive",
        });
      },
    },
  );

  const onBookmarkClick = () => {
    if (needsReview) return;
    document
      .querySelector(`[data-highlight-id="${highlight.id}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  };

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <HighlightWrapper
        clickable={clickable}
        onClick={onBookmarkClick}
        className="flex flex-col gap-2 text-left"
      >
        {needsReview && (
          <span className="w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("preview.highlight_needs_review")}
          </span>
        )}
        <blockquote
          cite={highlight.bookmarkId}
          className={cn(
            "prose border-l-[6px] p-2 pl-6 italic dark:prose-invert prose-p:text-sm",
            HIGHLIGHT_COLOR_MAP["border-l"][highlight.color],
          )}
        >
          <p>{highlight.text || t("preview.highlight_no_saved_text")}</p>
        </blockquote>
        {needsReview && (
          <p className="text-xs text-muted-foreground">
            {t("preview.highlight_needs_review_description")}
          </p>
        )}
        {highlight.note && (
          <span className="text-sm text-muted-foreground">
            {highlight.note}
          </span>
        )}
      </HighlightWrapper>
      {!readOnly && (
        <div className="flex gap-2">
          <ActionButton
            loading={isDeleting}
            variant="ghost"
            onClick={() => deleteHighlight({ highlightId: highlight.id })}
          >
            <Trash2 className="size-4 text-destructive" />
          </ActionButton>
        </div>
      )}
    </div>
  );
}
