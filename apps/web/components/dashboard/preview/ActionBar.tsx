import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Pencil, Trash2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import DeleteBookmarkConfirmationDialog from "../bookmarks/DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "../bookmarks/EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";

export default function ActionBar({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);

  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);

  const onError = () => {
    toast({
      variant: "destructive",
      title: "Something went wrong",
      description: "There was a problem with your request.",
    });
  };
  const { mutate: favBookmark, isPending: pendingFav } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "The bookmark has been updated!",
      });
    },
    onError,
  });
  const { mutate: archiveBookmark, isPending: pendingArchive } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        toast({
          description: `The bookmark has been ${resp.archived ? "Archived" : "Un-archived"}!`,
        });
      },
      onError,
    });

  const favoriteLabel = bookmark.favourited
    ? t("actions.unfavorite")
    : t("actions.favorite");
  const archiveLabel = bookmark.archived
    ? t("actions.unarchive")
    : t("actions.archive");
  const actionButtonClass =
    "flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/90 text-sm text-muted-foreground shadow-xs transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-(--ease-out) hover:bg-accent hover:text-foreground active:scale-[0.97]";

  return (
    <div className="grid grid-cols-2 gap-2 text-muted-foreground">
      <Tooltip delayDuration={0}>
        <EditBookmarkDialog
          bookmark={bookmark}
          open={isEditBookmarkDialogOpen}
          setOpen={setEditBookmarkDialogOpen}
        />

        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="none"
            className={actionButtonClass}
            onClick={() => {
              setEditBookmarkDialogOpen(true);
            }}
          >
            <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>{t("actions.edit")}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.edit")}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            className={actionButtonClass}
            loading={pendingFav}
            onClick={() => {
              favBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={18}
              strokeWidth={1.5}
            />
            <span>{favoriteLabel}</span>
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{favoriteLabel}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            loading={pendingArchive}
            className={actionButtonClass}
            onClick={() => {
              archiveBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            }}
          >
            <ArchivedActionIcon
              archived={bookmark.archived}
              size={18}
              strokeWidth={1.5}
            />
            <span>{archiveLabel}</span>
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{archiveLabel}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <DeleteBookmarkConfirmationDialog
          bookmark={bookmark}
          open={deleteBookmarkDialogOpen}
          setOpen={setDeleteBookmarkDialogOpen}
        />
        <TooltipTrigger asChild>
          <Button
            className={actionButtonClass}
            variant="ghost"
            size="none"
            onClick={() => setDeleteBookmarkDialogOpen(true)}
          >
            <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>{t("actions.delete")}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.delete")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
