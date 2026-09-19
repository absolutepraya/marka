"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Loader2, ShieldCheck, UserPlus, UserRoundX } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useTranslation } from "@/lib/i18n/client";

export function SharedContentPermissionsModal({
  bookmark,
  open,
  setOpen,
  children,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const { data, isPending } = useQuery(
    api.bookmarks.getContentPermissions.queryOptions(
      { bookmarkId: bookmark.id },
      { enabled: open },
    ),
  );

  useEffect(() => {
    if (!open) setSelectedUserId(undefined);
  }, [open]);

  const invalidate = () =>
    queryClient.invalidateQueries(
      api.bookmarks.getContentPermissions.queryFilter({
        bookmarkId: bookmark.id,
      }),
    );

  const grant = useMutation(
    api.bookmarks.grantContentEditor.mutationOptions({
      onSuccess: async () => {
        setSelectedUserId(undefined);
        await invalidate();
        toast({ description: t("shared_content.grant_success") });
      },
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const revoke = useMutation(
    api.bookmarks.revokeContentEditor.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast({ description: t("shared_content.revoke_success") });
      },
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <ResponsiveDialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            {t("shared_content.title")}
          </DialogTitle>
          <DialogDescription>
            {t("shared_content.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3" aria-labelledby="add-content-editor">
            <div>
              <h3 id="add-content-editor" className="text-sm font-medium">
                {t("shared_content.add_editor")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("shared_content.eligible_description")}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                disabled={isPending || grant.isPending}
              >
                <SelectTrigger className="min-h-10 min-w-0 flex-1">
                  <SelectValue
                    placeholder={t("shared_content.choose_person")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {data?.eligibleUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <UserAvatar
                          name={user.name}
                          image={user.image}
                          className="size-6"
                        />
                        <span className="min-w-0 truncate">
                          {user.name}{" "}
                          <span className="text-muted-foreground">
                            ({user.email})
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="min-h-10 gap-2"
                disabled={!selectedUserId || grant.isPending}
                onClick={() =>
                  selectedUserId &&
                  grant.mutate({
                    bookmarkId: bookmark.id,
                    userId: selectedUserId,
                  })
                }
              >
                {grant.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                {t("shared_content.grant_access")}
              </Button>
            </div>
            {data?.eligibleUsers.length === 0 && (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("shared_content.no_eligible_users")}
              </p>
            )}
          </section>

          <section
            className="space-y-3"
            aria-labelledby="current-content-editors"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="current-content-editors" className="text-sm font-medium">
                {t("shared_content.current_editors")}
              </h3>
              <Badge variant="secondary">{data?.editors.length ?? 0}</Badge>
            </div>
            {isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />{" "}
                {t("shared_content.loading")}
              </div>
            ) : data?.editors.length ? (
              <div className="space-y-2">
                {data.editors.map((editor) => (
                  <div
                    key={editor.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        name={editor.name}
                        image={editor.image}
                        className="size-9"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {editor.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {editor.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9 shrink-0 gap-2"
                      disabled={revoke.isPending}
                      onClick={() =>
                        revoke.mutate({
                          bookmarkId: bookmark.id,
                          userId: editor.id,
                        })
                      }
                    >
                      <UserRoundX className="size-4" aria-hidden="true" />
                      {t("shared_content.revoke")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                {t("shared_content.no_editors")}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
          >
            {t("shared_content.close")}
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
