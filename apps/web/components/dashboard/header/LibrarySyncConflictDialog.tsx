"use client";

import React from "react";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { offlineLibraryDb } from "@/lib/offline-library/repository";
import type { ZOfflineSyncConflict } from "@karakeep/shared/types/offlineSync";

interface LibrarySyncConflictDialogProps {
  conflict: ZOfflineSyncConflict | null;
  onChooseLocal: (conflict: ZOfflineSyncConflict) => Promise<void>;
  onChooseServer: (conflict: ZOfflineSyncConflict) => Promise<void>;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "string") return value || "Empty";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function LibrarySyncConflictDialog({
  conflict,
  onChooseLocal,
  onChooseServer,
}: LibrarySyncConflictDialogProps) {
  const [bookmarkLabel, setBookmarkLabel] = React.useState("Bookmark");
  const [resolving, setResolving] = React.useState<"local" | "server" | null>(
    null,
  );
  const [resolutionError, setResolutionError] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!conflict) {
      setBookmarkLabel("Bookmark");
      setResolutionError(null);
      return;
    }

    void offlineLibraryDb.bookmarks
      .get(conflict.bookmarkId)
      .then((bookmark) => {
        if (!cancelled) {
          setBookmarkLabel(bookmark?.title || "Untitled bookmark");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conflict]);

  async function choose(
    choice: "local" | "server",
    action: (currentConflict: ZOfflineSyncConflict) => Promise<void>,
  ) {
    if (!conflict || resolving) return;

    setResolving(choice);
    setResolutionError(null);
    try {
      await action(conflict);
    } catch {
      setResolutionError("Could not resolve this conflict. Try again.");
    } finally {
      setResolving(null);
    }
  }

  return (
    <Dialog open={conflict !== null}>
      <ResponsiveDialogContent hideCloseBtn>
        <DialogHeader>
          <DialogTitle>Resolve library sync conflict</DialogTitle>
          <DialogDescription>
            Choose which value to keep before the library can finish syncing.
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">Bookmark</dt>
              <dd className="mt-1 break-words text-muted-foreground">
                {bookmarkLabel}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Field</dt>
              <dd className="mt-1 break-words text-muted-foreground">
                {conflict.field}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Offline value</dt>
              <dd className="mt-1 break-words rounded-md bg-muted px-3 py-2 text-muted-foreground">
                {formatValue(conflict.localValue)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Server value</dt>
              <dd className="mt-1 break-words rounded-md bg-muted px-3 py-2 text-muted-foreground">
                {formatValue(conflict.serverValue)}
              </dd>
            </div>
          </dl>
        )}
        {resolutionError && (
          <p role="alert" className="text-sm text-destructive">
            {resolutionError}
          </p>
        )}

        <DialogFooter equalColumns={2}>
          <Button
            type="button"
            variant="secondary"
            disabled={!conflict || resolving !== null}
            onClick={() => void choose("server", onChooseServer)}
          >
            {resolving === "server" ? "Resolving…" : "Use server value"}
          </Button>
          <Button
            type="button"
            disabled={!conflict || resolving !== null}
            onClick={() => void choose("local", onChooseLocal)}
          >
            {resolving === "local" ? "Resolving…" : "Keep offline value"}
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
