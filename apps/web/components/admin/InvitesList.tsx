"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { ActionButton } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailX, UserPlus } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

import ActionConfirmingDialog from "../ui/action-confirming-dialog";
import { AdminCard } from "./AdminCard";
import CreateInviteDialog from "./CreateInviteDialog";

export default function InvitesList() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { data: invites } = useSuspenseQuery(api.invites.list.queryOptions());

  const { mutateAsync: revokeInvite, isPending: isRevokePending } = useMutation(
    api.invites.revoke.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Invite revoked successfully",
        });
        queryClient.invalidateQueries(api.invites.list.pathFilter());
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to revoke invite: ${e.message}`,
        });
      },
    }),
  );

  const { mutateAsync: resendInvite, isPending: isResendPending } = useMutation(
    api.invites.resend.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Invite resent successfully",
        });
        queryClient.invalidateQueries(api.invites.list.pathFilter());
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          description: `Failed to resend invite: ${e.message}`,
        });
      },
    }),
  );

  const activeInvites = invites?.invites || [];

  return (
    <InvitesContent
      activeInvites={activeInvites}
      createAction={
        <CreateInviteDialog>
          <ButtonWithTooltip tooltip="Send Invite" variant="outline">
            <UserPlus size={16} />
          </ButtonWithTooltip>
        </CreateInviteDialog>
      }
      rowActions={(invite) => (
        <div className="flex items-center gap-1.5">
          <ButtonWithTooltip
            tooltip="Resend Invite"
            variant="outline"
            size="sm"
            onClick={() => resendInvite({ inviteId: invite.id })}
            disabled={isResendPending}
          >
            <Mail size={14} />
          </ButtonWithTooltip>
          <ActionConfirmingDialog
            title="Revoke Invite"
            description={`Are you sure you want to revoke the invite for ${invite.email}? This action cannot be undone.`}
            actionButton={(setDialogOpen) => (
              <ActionButton
                variant="destructive"
                loading={isRevokePending}
                onClick={async () => {
                  await revokeInvite({ inviteId: invite.id });
                  setDialogOpen(false);
                }}
              >
                Revoke
              </ActionButton>
            )}
          >
            <ButtonWithTooltip
              tooltip="Revoke Invite"
              variant="outline"
              size="sm"
            >
              <MailX size={14} />
            </ButtonWithTooltip>
          </ActionConfirmingDialog>
        </div>
      )}
      formatCreatedAt={(date) =>
        formatDistanceToNow(new Date(date), { addSuffix: true })
      }
    />
  );
}

export function InvitesContent({
  activeInvites,
  createAction,
  rowActions,
  formatCreatedAt,
}: {
  activeInvites: inferRouterOutputs<AppRouter>["invites"]["list"]["invites"];
  createAction: React.ReactNode;
  rowActions: (
    invite: inferRouterOutputs<AppRouter>["invites"]["list"]["invites"][number],
  ) => React.ReactNode;
  formatCreatedAt: (date: Date) => string;
}) {
  return (
    <AdminCard>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              User invitations ({activeInvites.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              Track pending invites, resend them when needed, or revoke access
              before it is accepted.
            </p>
          </div>
          {createAction}
        </div>

        {activeInvites.length === 0 ? (
          <EmptyState
            compact
            icon={<Mail className="size-6" />}
            title="No pending invites"
            description="Create an invite when you want to onboard another user to the instance."
            className="bg-background/70"
          />
        ) : (
          <div className="shadow-xs overflow-hidden rounded-xl border border-border/70 bg-background/80">
            <Table className="whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium text-foreground">
                      {invite.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invite.invitedBy.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCreatedAt(invite.createdAt)}
                    </TableCell>
                    <TableCell>{rowActions(invite)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AdminCard>
  );
}
