"use client";

import { useTranslation } from "@/lib/i18n/client";
import { BookOpen, X } from "lucide-react";

export default function ReadingProgressBanner({
  percent,
  isRestarted = false,
  actionPending = false,
  onContinue,
  onStartOver,
  onUndoStartOver,
  onDismiss,
}: {
  percent?: number | null;
  isRestarted?: boolean;
  actionPending?: boolean;
  onContinue: () => void;
  onStartOver?: () => void;
  onUndoStartOver?: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  const message = isRestarted
    ? t("preview.reading_restarted")
    : percent && percent > 0
      ? t("preview.continue_reading_percent", { percent })
      : t("preview.continue_reading");

  return (
    <div className="sticky top-0 z-10 flex justify-center px-2 py-1.5 sm:px-4 sm:pb-3 sm:pt-1.5">
      <div className="flex w-fit max-w-full min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-sm shadow-sm backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2">
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {message}
        </span>
        {isRestarted ? (
          <button
            type="button"
            onClick={onUndoStartOver}
            disabled={actionPending}
            className="ease-(--ease-out) shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-[transform,opacity] duration-150 hover:opacity-80 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
          >
            {t("preview.undo")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onContinue}
              disabled={actionPending}
              className="ease-(--ease-out) shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-[transform,opacity] duration-150 hover:opacity-80 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
            >
              {t("preview.continue_button")}
            </button>
            {onStartOver && (
              <button
                type="button"
                onClick={onStartOver}
                disabled={actionPending}
                className="ease-(--ease-out) shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100"
              >
                {t("preview.start_over")}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onDismiss}
          disabled={actionPending}
          className="ease-(--ease-out) shrink-0 rounded-full p-1 text-muted-foreground transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.97] motion-reduce:transition-colors motion-reduce:active:scale-100"
          aria-label={t("preview.dismiss")}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
