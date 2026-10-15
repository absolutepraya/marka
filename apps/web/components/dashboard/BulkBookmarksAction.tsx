"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { ActionButton } from "@/components/ui/action-button";
import { EditingButton } from "@/components/ui/editing-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import useBulkActionsStore from "@/lib/bulkActions";
import {
  BulkRefreshLimitError,
  MAX_BULK_REFRESH_BOOKMARKS,
  useBookmarkBulkMutations,
} from "@/lib/hooks/useBookmarkBulkActions";
import { useUndoableBookmarkDeletion } from "@/lib/hooks/useUndoableBookmarkDeletion";
import type { UpdateBookmarkProps } from "@/lib/hooks/useBookmarkBulkActions";
import { useTranslation } from "@/lib/i18n/client";
import {
  CheckCheck,
  FileDown,
  Hash,
  Link,
  List,
  ListMinus,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";

import BulkManageListsModal from "./bookmarks/BulkManageListsModal";
import BulkTagModal from "./bookmarks/BulkTagModal";
import { ArchivedActionIcon, FavouritedActionIcon } from "./bookmarks/icons";
import { canSelectBookmarkForBulkActions } from "./bookmarks/bookmarkListPermissions";

export default function BulkBookmarksAction() {
  const { t } = useTranslation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRemoveFromListDialogOpen, setIsRemoveFromListDialogOpen] =
    useState(false);
  const [manageListsModal, setManageListsModalOpen] = useState(false);
  const [bulkTagModal, setBulkTagModalOpen] = useState(false);
  const pathname = usePathname();
  const currentPathnameRef = useRef(pathname);

  const onError = () => {
    toast({
      variant: "destructive",
      title: "Something went wrong",
      description: "There was a problem with your request.",
    });
  };
  const bulkActionsStore = useBulkActionsStore();
  const { data: session } = useSession();
  const { scheduleDeletes, pendingBookmarkIds } = useUndoableBookmarkDeletion();
  const selectedBookmarks = bulkActionsStore.getSelectedBookmarks();
  const ownedSelectedBookmarks =
    bulkActionsStore.getSelectedActionableBookmarks(
      (bookmark) => bookmark.userId === session?.user?.id,
    );
  const selectableBookmarks = bulkActionsStore.visibleBookmarks.filter(
    (bookmark) =>
      canSelectBookmarkForBulkActions({
        bookmarkOwnerId: bookmark.userId,
        currentUserId: session?.user?.id,
        listContext: bulkActionsStore.listContext,
      }),
  );
  const everythingSelected =
    selectableBookmarks.length > 0 &&
    selectedBookmarks.length === selectableBookmarks.length;
  const {
    isBulkEditEnabled,
    listContext: withinListContext,
    setIsBulkEditEnabled,
    setSelectedBookmarkIds,
    unSelectAll: unSelectAllBookmarks,
  } = bulkActionsStore;
  const {
    updateBookmarkMutator,
    updateSelectedBookmarks,
    recrawlBookmarkMutator,
    refreshBookmarkMutator,
    removeSelectedBookmarksFromList,
    recrawlSelectedLinkBookmarks,
    refreshSelectedBookmarks,
    removeBookmarkFromListMutator,
    selectedBookmarkLinksText,
  } = useBookmarkBulkMutations({
    selectedBookmarks,
    selectedActionableBookmarks: () => ownedSelectedBookmarks,
    listContext: withinListContext,
    onError,
    onBulkEditDone: () => {
      setIsBulkEditEnabled(false);
    },
  });

  // Reset bulk edit state when the route changes
  useEffect(() => {
    if (pathname !== currentPathnameRef.current) {
      currentPathnameRef.current = pathname;
      setIsBulkEditEnabled(false);
    }
  }, [pathname, setIsBulkEditEnabled]);

  const preserveOfflineArchives = async () => {
    const links = await recrawlSelectedLinkBookmarks(true);
    toast({
      description: t("toasts.bookmarks.bulk_archive", { count: links.length }),
    });
  };

  const refreshBookmarks = async () => {
    try {
      const bookmarks = await refreshSelectedBookmarks();
      toast({
        description: t("toasts.bookmarks.bulk_refresh", {
          count: bookmarks.length,
        }),
      });
    } catch (error) {
      if (error instanceof BulkRefreshLimitError) {
        toast({
          variant: "destructive",
          description: t("toasts.bookmarks.bulk_refresh_limit", {
            count: MAX_BULK_REFRESH_BOOKMARKS,
          }),
        });
        return;
      }
      throw error;
    }
  };

  function isClipboardAvailable() {
    if (typeof window === "undefined") {
      return false;
    }
    return window && window.navigator && window.navigator.clipboard;
  }

  const copyLinks = async () => {
    if (!isClipboardAvailable()) {
      toast({
        description: `Copying is only available over https`,
      });
      return;
    }
    await navigator.clipboard.writeText(selectedBookmarkLinksText());

    toast({
      description: `Added ${selectedBookmarks.length} bookmark links into the clipboard!`,
    });
  };

  const updateBookmarks = async ({
    favourited,
    archived,
  }: UpdateBookmarkProps) => {
    await updateSelectedBookmarks({ favourited, archived });
    setIsBulkEditEnabled(false);
    toast({
      description: `${ownedSelectedBookmarks.length} bookmarks have been updated!`,
    });
  };

  const deleteBookmarks = () => {
    scheduleDeletes(ownedSelectedBookmarks.map((bookmark) => bookmark.id));
    setIsBulkEditEnabled(false);
    setIsDeleteDialogOpen(false);
  };

  const removeBookmarksFromList = async () => {
    if (!withinListContext) return;

    const results = await removeSelectedBookmarksFromList();

    const successes = results.filter((r) => r.status === "fulfilled").length;
    if (successes > 0) {
      toast({
        description: `${successes} bookmarks have been removed from the list!`,
      });
    }
    setIsRemoveFromListDialogOpen(false);
  };

  const alreadyFavourited =
    ownedSelectedBookmarks.length &&
    ownedSelectedBookmarks.every((item) => item.favourited === true);

  const alreadyArchived =
    ownedSelectedBookmarks.length &&
    ownedSelectedBookmarks.every((item) => item.archived === true);

  const actionList = [
    {
      id: "copy-links",
      name: isClipboardAvailable()
        ? t("actions.copy_link")
        : "Copying is only available over https",
      icon: <Link size={16} />,
      action: () => copyLinks(),
      isPending: false,
      hidden: !isBulkEditEnabled,
    },
    {
      id: "remove-from-list",
      name: t("actions.remove_from_list"),
      icon: <ListMinus size={16} />,
      action: () => setIsRemoveFromListDialogOpen(true),
      isPending: removeBookmarkFromListMutator.isPending,
      hidden:
        !isBulkEditEnabled ||
        !withinListContext ||
        withinListContext.type !== "manual" ||
        (withinListContext.userRole !== "editor" &&
          withinListContext.userRole !== "owner"),
    },
    {
      id: "add-to-list",
      name: t("actions.add_to_list"),
      icon: <List size={16} />,
      action: () => setManageListsModalOpen(true),
      isPending: false,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "edit-tags",
      name: t("actions.edit_tags"),
      icon: <Hash size={16} />,
      action: () => setBulkTagModalOpen(true),
      isPending: false,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "favorite",
      name: alreadyFavourited ? t("actions.unfavorite") : t("actions.favorite"),
      icon: <FavouritedActionIcon favourited={!!alreadyFavourited} size={16} />,
      action: () => updateBookmarks({ favourited: !alreadyFavourited }),
      isPending: updateBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "archive",
      name: alreadyArchived ? t("actions.unarchive") : t("actions.archive"),
      icon: <ArchivedActionIcon size={16} archived={!!alreadyArchived} />,
      action: () => updateBookmarks({ archived: !alreadyArchived }),
      isPending: updateBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "preserve-archive",
      name: t("actions.preserve_offline_archive"),
      icon: <FileDown size={16} />,
      action: () => preserveOfflineArchives(),
      isPending: recrawlBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "refresh",
      name: t("actions.refresh"),
      icon: <RotateCw size={16} />,
      action: () => refreshBookmarks(),
      isPending: refreshBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "delete",
      name: t("actions.delete"),
      icon: <Trash2 size={16} color="red" />,
      action: () => setIsDeleteDialogOpen(true),
      hidden: !isBulkEditEnabled,
      disabled: ownedSelectedBookmarks.length === 0,
    },
    {
      id: "select-all",
      name: everythingSelected
        ? t("actions.unselect_all")
        : t("actions.select_all"),
      icon: (
        <p className="flex items-center gap-2">
          ( <CheckCheck size={16} /> {selectedBookmarks.length} )
        </p>
      ),
      action: () =>
        everythingSelected
          ? unSelectAllBookmarks()
          : setSelectedBookmarkIds(
              selectableBookmarks.map((bookmark) => bookmark.id),
            ),
      alwaysEnable: true,
      hidden: !isBulkEditEnabled,
    },
    {
      id: "close",
      name: t("actions.close_bulk_edit"),
      icon: <X size={16} />,
      action: () => setIsBulkEditEnabled(false),
      alwaysEnable: true,
      hidden: !isBulkEditEnabled,
    },
    {
      id: "enable",
      name: t("actions.bulk_edit"),
      icon: <Pencil size={16} />,
      action: () => setIsBulkEditEnabled(true),
      alwaysEnable: true,
      hidden: isBulkEditEnabled,
      disabled: selectableBookmarks.length === 0,
    },
  ];

  const pendingBookmarkIdSet = new Set(pendingBookmarkIds);

  return (
    <>
      <ActionConfirmingDialog
        open={isDeleteDialogOpen}
        setOpen={setIsDeleteDialogOpen}
        title={"Delete Bookmarks"}
        description={<p>Are you sure you want to delete these bookmarks?</p>}
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={ownedSelectedBookmarks.some((bookmark) =>
              pendingBookmarkIdSet.has(bookmark.id),
            )}
            onClick={() => deleteBookmarks()}
          >
            {t("actions.delete")}
          </ActionButton>
        )}
      />
      <ActionConfirmingDialog
        open={isRemoveFromListDialogOpen}
        setOpen={setIsRemoveFromListDialogOpen}
        title={"Remove Bookmarks from List"}
        description={
          <p>
            Are you sure you want to remove {selectedBookmarks.length} bookmarks
            from this list?
          </p>
        }
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={removeBookmarkFromListMutator.isPending}
            onClick={() => removeBookmarksFromList()}
          >
            {t("actions.remove")}
          </ActionButton>
        )}
      />
      {manageListsModal && (
        <BulkManageListsModal
          bookmarkIds={ownedSelectedBookmarks.map((b) => b.id)}
          open={manageListsModal}
          setOpen={setManageListsModalOpen}
        />
      )}
      {bulkTagModal && (
        <BulkTagModal
          bookmarkIds={ownedSelectedBookmarks.map((b) => b.id)}
          open={bulkTagModal}
          setOpen={setBulkTagModalOpen}
        />
      )}
      <div className="contents">
        {actionList
          .filter((action) => !action.hidden)
          .map(
            ({
              id,
              name,
              icon: Icon,
              action,
              isPending,
              alwaysEnable,
              disabled,
            }) => (
              <EditingButton
                tooltip={name}
                aria-label={name}
                disabled={
                  disabled || (!selectedBookmarks.length && !alwaysEnable)
                }
                loading={!!isPending}
                variant="ghost"
                className="h-8 min-w-8 px-2 sm:h-9 sm:min-w-9 sm:px-2.5 [&_svg]:size-4 sm:[&_svg]:size-[18px]"
                key={id}
                onClick={action}
              >
                {Icon}
              </EditingButton>
            ),
          )}
      </div>
    </>
  );
}
