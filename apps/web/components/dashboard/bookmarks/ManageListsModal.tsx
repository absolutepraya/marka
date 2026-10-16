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
import LoadingSpinner from "@/components/ui/spinner";
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
import { truncateListPath } from "../lists/listPath";
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
          <div
            className="flex min-h-28 items-center justify-center"
            role="status"
            aria-label={t("lists.navigation.loading")}
          >
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <section className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-sm font-medium">Current lists</h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {currentLists?.length ?? 0}
                </span>
              </div>
              {currentLists?.length ? (
                <ul className="space-y-1.5">
                  {currentLists.map((list) => {
                    const path = listTree?.getPathById(list.id);
                    const fullPath = path
                      ?.map((item) => `${item.icon} ${item.name}`)
                      .join(" / ");
                    return (
                      <li
                        key={list.id}
                        className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2"
                      >
                        <p
                          className="min-w-0 flex-1 truncate text-sm text-foreground"
                          title={fullPath}
                        >
                          {path ? truncateListPath(path) : list.name}
                        </p>
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
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
                  This bookmark is not in a list yet.
                </p>
              )}
            </section>

            <section className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div>
                <h3 className="text-sm font-medium">Add to a list</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose a destination to add this bookmark immediately.
                </p>
              </div>
              <BookmarkListSelector
                allPathsOverride={isOnline ? undefined : listTree?.allPaths}
                hideBookmarkIds={currentLists?.map((list) => list.id)}
                onChange={(listId) => updateMembership(listId, "add")}
                listTypes={["manual"]}
                disabled={listMembershipMutation.isPending}
                className="h-10 sm:h-11"
              />
            </section>
          </div>
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
