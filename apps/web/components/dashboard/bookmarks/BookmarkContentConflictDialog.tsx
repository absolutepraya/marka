"use client";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";

export function BookmarkContentConflictDialog({
  draft,
  serverText,
  isSaving,
  onKeepDraft,
  onUseServer,
}: {
  draft: string | null;
  serverText: string | null;
  isSaving: boolean;
  onKeepDraft: () => void;
  onUseServer: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={draft !== null}>
      <ResponsiveDialogContent hideCloseBtn className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("content_conflict.title")}</DialogTitle>
          <DialogDescription>
            {t("content_conflict.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" role="alert">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("content_conflict.draft")}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
              {draft ?? ""}
            </pre>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              {t("content_conflict.server_version")}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
              {serverText ?? ""}
            </pre>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            disabled={isSaving}
            onClick={onUseServer}
          >
            {t("content_conflict.use_server")}
          </Button>
          <Button
            type="button"
            className="min-h-10"
            disabled={isSaving}
            onClick={onKeepDraft}
          >
            {isSaving
              ? t("content_conflict.saving_draft")
              : t("content_conflict.keep_draft")}
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
