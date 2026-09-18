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
  return (
    <Dialog open={draft !== null}>
      <ResponsiveDialogContent hideCloseBtn className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>This text changed while you were editing</DialogTitle>
          <DialogDescription>
            Another save reached the server first. Choose which version should
            become the canonical bookmark content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" role="alert">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Your draft</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 text-sm">
              {draft ?? ""}
            </pre>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Server version</p>
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
            Use server version
          </Button>
          <Button
            type="button"
            className="min-h-10"
            disabled={isSaving}
            onClick={onKeepDraft}
          >
            {isSaving ? "Saving draft…" : "Keep my draft"}
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
