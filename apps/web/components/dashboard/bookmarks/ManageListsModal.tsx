import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import manageListsBones from "@/components/loading-ui/bones/manage-lists.bones.json";
import { ManageListsContent } from "./ManageListsContent";
import { useTranslation } from "@/lib/i18n/client";
import {
  isOfflineQueuedMutation,
  useOfflineSafeBookmarkListMembership,
} from "@/lib/hooks/useOfflineSafeBookmarkMutation";
import { useOfflineLibraryStatus } from "@/lib/offline-library/provider";
import { offlineLibraryDb } from "@/lib/offline-library/repository";
import { useQuery } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { Archive, X } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { listsToTree } from "@karakeep/shared/utils/listUtils";

import { BookmarkListSelector } from "../lists/BookmarkListSelector";
import ArchiveBookmarkButton from "./action-buttons/ArchiveBookmarkButton";

export default function ManageListsModal({
  bookmarkId,
  open,
  setOpen,
}: {
  bookmarkId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const offlineStatus = useOfflineLibraryStatus();
  const isOnline = offlineStatus.kind === "online";
  const [offlineLists, setOfflineLists] = useState<{
    lists: ZBookmarkList[];
    membershipListIds: Set<string>;
  }>();

  const { data: allLists, isPending: isAllListsPending } = useBookmarkLists(
    undefined,
    { enabled: open && isOnline },
  );

  const { data: alreadyInList, isPending: isAlreadyInListPending } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      {
        bookmarkId,
      },
      { enabled: open && isOnline },
    ),
  );

  useEffect(() => {
    if (!open || isOnline) {
      setOfflineLists(undefined);
      return;
    }
    const subscription = liveQuery(async () => {
      const [lists, memberships] = await Promise.all([
        offlineLibraryDb.lists.toArray(),
        offlineLibraryDb.bookmarkListMemberships
          .where("bookmarkId")
          .equals(bookmarkId)
          .toArray(),
      ]);
      return {
        lists,
        membershipListIds: new Set(
          memberships.map((membership) => membership.listId),
        ),
      };
    }).subscribe({ next: setOfflineLists });
    return () => subscription.unsubscribe();
  }, [bookmarkId, isOnline, open]);

  const offlineListTree = useMemo(
    () => (offlineLists ? listsToTree(offlineLists.lists) : undefined),
    [offlineLists],
  );
  const currentLists = isOnline
    ? alreadyInList?.lists
    : offlineLists?.lists.filter((list) =>
        offlineLists.membershipListIds.has(list.id),
      );
  const listTree = isOnline ? allLists : offlineListTree;
  const isLoading = isOnline
    ? isAllListsPending || isAlreadyInListPending
    : !offlineLists;

  const listMembershipMutation = useOfflineSafeBookmarkListMembership();
  const updateMembership = (listId: string, action: "add" | "remove") => {
    void listMembershipMutation
      .mutateAsync({ bookmarkId, listId, action })
      .then((result) => {
        toast({
          description: isOfflineQueuedMutation(result)
            ? "Saved offline, will sync when connected"
            : t("toasts.lists.updated"),
        });
      })
      .catch((error: unknown) => {
        toast({
          variant: "destructive",
          description:
            error instanceof Error
              ? error.message
              : t("common.something_went_wrong"),
        });
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        position="bottom"
        className="left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x-0 border-b-0 bg-card p-0 shadow-2xl sm:bottom-auto sm:left-[50%] sm:top-[calc(var(--vvo)+var(--vvh)/2)] sm:max-h-[calc(var(--vvh)-2rem)] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-6 text-left sm:px-6">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {t("actions.manage_lists")}
          </DialogTitle>
          <DialogDescription>
            Add this bookmark to lists or remove existing memberships.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <CapturedSkeleton name="manage-lists" bones={manageListsBones} />
        ) : (
          <ManageListsContent
            currentLists={currentLists}
            listTree={listTree}
            renderRemove={(list) => (
              <ActionButton
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-lg"
                loading={listMembershipMutation.isPending}
                onClick={() => updateMembership(list.id, "remove")}
                aria-label={t("actions.remove_from_list")}
              >
                <X className="size-4" />
              </ActionButton>
            )}
            selector={
              <BookmarkListSelector
                allPathsOverride={isOnline ? undefined : listTree?.allPaths}
                hideBookmarkIds={currentLists?.map((list) => list.id)}
                onChange={(listId) => updateMembership(listId, "add")}
                listTypes={["manual"]}
                disabled={listMembershipMutation.isPending}
                className="h-10 sm:h-11"
              />
            }
          />
        )}

        <DialogFooter
          equalColumns={2}
          className="sticky bottom-0 border-t border-border/70 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6 sm:py-4"
        >
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
          <ArchiveBookmarkButton
            type="button"
            bookmarkId={bookmarkId}
            onDone={() => setOpen(false)}
            variant="secondary"
          >
            <Archive className="mr-2 size-4" /> {t("actions.archive")}
          </ArchiveBookmarkButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useManageListsModal(bookmarkId: string) {
  const [open, setOpen] = useState(false);

  return {
    open,
    setOpen,
    content: open && (
      <ManageListsModal bookmarkId={bookmarkId} open={open} setOpen={setOpen} />
    ),
  };
}
