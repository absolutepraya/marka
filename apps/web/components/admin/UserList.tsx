"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonWithTooltip } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/lib/auth/client";
import { useTranslation } from "@/lib/i18n/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Check, KeyRound, Pencil, Trash, UserPlus, X } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import AddUserDialog from "./AddUserDialog";
import { AdminCard } from "./AdminCard";
import ResetPasswordDialog from "./ResetPasswordDialog";
import UpdateUserDialog from "./UpdateUserDialog";

function toHumanReadableSize(size: number) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (size === 0) return "0 Bytes";
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

export default function UsersSection() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data: session } = useSession();
  const {
    data: { users },
  } = useSuspenseQuery(api.users.list.queryOptions());
  const { data: userStats } = useSuspenseQuery(
    api.admin.userStats.queryOptions(),
  );
  const { mutateAsync: deleteUser, isPending: isDeletionPending } = useMutation(
    api.users.delete.mutationOptions({
      onSuccess: () => {
        toast({
          description: "User deleted",
        });
        queryClient.invalidateQueries(api.users.list.pathFilter());
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Something went wrong: ${e.message}`,
        });
      },
    }),
  );

  return (
    <UsersContent
      users={users}
      userStats={userStats}
      createAction={
        <AddUserDialog>
          <ButtonWithTooltip tooltip="Create User" variant="outline">
            <UserPlus size={16} />
          </ButtonWithTooltip>
        </AddUserDialog>
      }
      rowActions={(u) => (
        <div className="flex items-center gap-1.5">
          <ActionConfirmingDialog
            title={t("admin.users_list.delete_user")}
            description={t("admin.users_list.delete_user_confirm_description", {
              name: u.name ?? "this user",
            })}
            actionButton={(setDialogOpen) => (
              <ActionButton
                variant="destructive"
                loading={isDeletionPending}
                onClick={async () => {
                  await deleteUser({ userId: u.id });
                  setDialogOpen(false);
                }}
              >
                Delete
              </ActionButton>
            )}
          >
            <ButtonWithTooltip
              tooltip={t("admin.users_list.delete_user")}
              variant="outline"
              disabled={session!.user.id === u.id}
            >
              <Trash size={16} />
            </ButtonWithTooltip>
          </ActionConfirmingDialog>
          <ResetPasswordDialog userId={u.id}>
            <ButtonWithTooltip
              tooltip={t("admin.users_list.reset_password")}
              variant="outline"
              disabled={session!.user.id === u.id || !u.localUser}
            >
              <KeyRound size={16} />
            </ButtonWithTooltip>
          </ResetPasswordDialog>
          <UpdateUserDialog
            userId={u.id}
            currentRole={u.role!}
            currentQuota={u.bookmarkQuota}
            currentStorageQuota={u.storageQuota}
          >
            <ButtonWithTooltip
              tooltip="Edit User"
              variant="outline"
              disabled={session!.user.id === u.id}
            >
              <Pencil size={16} />
            </ButtonWithTooltip>
          </UpdateUserDialog>
        </div>
      )}
    />
  );
}

export function UsersContent({
  users,
  userStats,
  createAction,
  rowActions,
}: {
  users: inferRouterOutputs<AppRouter>["users"]["list"]["users"];
  userStats: inferRouterOutputs<AppRouter>["admin"]["userStats"];
  createAction: React.ReactNode;
  rowActions: (
    user: inferRouterOutputs<AppRouter>["users"]["list"]["users"][number],
  ) => React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AdminCard>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("admin.users_list.users_list")}
            </h2>
            <p className="text-sm text-muted-foreground">
              Review account roles, quotas, storage usage, and recovery actions.
            </p>
          </div>
          {createAction}
        </div>

        <div className="shadow-xs overflow-hidden rounded-xl border border-border/70 bg-background/80">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.email")}</TableHead>
                <TableHead>{t("admin.users_list.num_bookmarks")}</TableHead>
                <TableHead>{t("admin.users_list.asset_sizes")}</TableHead>
                <TableHead>{t("common.role")}</TableHead>
                <TableHead>{t("admin.users_list.local_user")}</TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">
                    {u.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    {userStats[u.id].numBookmarks} /{" "}
                    {u.bookmarkQuota ?? t("admin.users_list.unlimited")}
                  </TableCell>
                  <TableCell>
                    {toHumanReadableSize(userStats[u.id].assetSizes)} /{" "}
                    {u.storageQuota
                      ? toHumanReadableSize(u.storageQuota)
                      : t("admin.users_list.unlimited")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-muted/60 text-muted-foreground"
                    >
                      {u.role && t(`common.roles.${u.role}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.localUser ? (
                      <Badge
                        variant="secondary"
                        className="border-success/20 bg-success/10 text-success gap-1 border"
                      >
                        <Check className="size-3.5" />
                        Yes
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="gap-1 border border-border/70 bg-muted/70 text-muted-foreground"
                      >
                        <X className="size-3.5" />
                        No
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{rowActions(u)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminCard>
  );
}
