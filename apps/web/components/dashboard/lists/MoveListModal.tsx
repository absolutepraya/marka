"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useOfflineLibraryStatus } from "@/lib/offline-library/provider";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  useEditBookmarkList,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";

import { BookmarkListSelector } from "./BookmarkListSelector";

export function MoveListModal({
  list,
  open,
  setOpen,
}: {
  list: ZBookmarkList;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useOfflineLibraryStatus();
  const lists = useBookmarkLists();
  const [parentId, setParentId] = useState(list.parentId ?? "");
  const [error, setError] = useState<string>();
  const mutation = useEditBookmarkList({ networkMode: "always", retry: false });
  useEffect(() => {
    if (open) {
      setParentId(list.parentId ?? "");
      setError(undefined);
    }
  }, [open, list.id, list.parentId]);
  const unchanged = parentId === (list.parentId ?? "");
  const offline = status.kind !== "online";

  async function move() {
    if (unchanged || offline || mutation.isPending) return;
    setError(undefined);
    try {
      await mutation.mutateAsync({
        listId: list.id,
        parentId: parentId || null,
      });
      toast({ description: t("lists.move.success", { name: list.name }) });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("common.something_went_wrong"),
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) setOpen(next);
      }}
    >
      <ResponsiveDialogContent>
        <DialogHeader>
          <DialogTitle>{t("lists.move.title")}</DialogTitle>
          <DialogDescription>
            {t("lists.move.description", { name: list.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <p className="text-sm font-medium">{t("lists.destination_list")}</p>
          <BookmarkListSelector
            hideSubtreeOf={list.id}
            ownerOnly
            rootLabel={t("lists.move.top_level")}
            value={parentId}
            onChange={setParentId}
            disabled={mutation.isPending || offline}
          />
          {!unchanged && (
            <p
              role="note"
              className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
            >
              {t("lists.move.sharing_warning")}
            </p>
          )}
          {offline && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("lists.move.offline")}
            </p>
          )}
          {lists.error && (
            <p role="alert" className="text-sm text-destructive">
              {t("lists.navigation.load_error")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter equalColumns={2}>
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => setOpen(false)}
          >
            {t("actions.cancel")}
          </Button>
          <ActionButton
            loading={mutation.isPending}
            disabled={unchanged || offline || lists.isPending || !!lists.error}
            onClick={move}
          >
            {t("lists.move.submit")}
          </ActionButton>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
