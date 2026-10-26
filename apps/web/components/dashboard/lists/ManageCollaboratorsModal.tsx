"use client";

import { useState } from "react";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import collaboratorsBones from "@/components/loading-ui/bones/collaborators.bones.json";
import { CollaboratorsContent } from "./CollaboratorsContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

import { canManageCollaboratorOnList } from "./collaborationUi";

export function ManageCollaboratorsModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  children,
  readOnly = false,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list: ZBookmarkList;
  children?: React.ReactNode;
  readOnly?: boolean;
}) {
  const api = useTRPC();
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }

  const [customOpen, customSetOpen] = useState(false);
  const open = userOpen ?? customOpen;
  const setOpen = userSetOpen ?? customSetOpen;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [recursive, setRecursive] = useState(false);
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    api.lists.getCollaborators.queryOptions(
      { listId: list.id },
      { enabled: open },
    ),
  );

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(
        api.lists.getCollaborators.queryFilter({ listId: list.id }),
      ),
      queryClient.invalidateQueries(api.lists.list.pathFilter()),
      queryClient.invalidateQueries(
        api.lists.getPendingInvitations.pathFilter(),
      ),
      queryClient.invalidateQueries(
        api.bookmarks.getBookmarks.queryFilter({ listId: list.id }),
      ),
      queryClient.invalidateQueries(
        api.bookmarks.getBookmarks.infiniteQueryFilter({ listId: list.id }),
      ),
    ]);

  const addCollaborator = useMutation(
    api.lists.addCollaborator.mutationOptions({
      onSuccess: async (result) => {
        toast({
          description: t(
            result.emailSent
              ? "lists.collaboration.invitation_delivery_sent"
              : "lists.collaboration.invitation_delivery_failed",
          ),
        });
        setEmail("");
        setRole("viewer");
        setRecursive(false);
        await invalidate();
      },
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const updateCollaborator = useMutation(
    api.lists.updateCollaborator.mutationOptions({
      onSuccess: invalidate,
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const removeCollaborator = useMutation(
    api.lists.removeCollaborator.mutationOptions({
      onSuccess: invalidate,
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const updateInvitation = useMutation(
    api.lists.updateInvitation.mutationOptions({
      onSuccess: invalidate,
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const resendInvitation = useMutation(
    api.lists.resendInvitation.mutationOptions({
      onSuccess: async (result) => {
        toast({
          description: t(
            result.emailSent
              ? "lists.collaboration.invitation_delivery_sent"
              : "lists.collaboration.invitation_delivery_failed",
          ),
        });
        await invalidate();
      },
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );
  const revokeInvitation = useMutation(
    api.lists.revokeInvitation.mutationOptions({
      onSuccess: invalidate,
      onError: (error) =>
        toast({ variant: "destructive", description: error.message }),
    }),
  );

  const visibleCollaborators =
    data?.collaborators.filter((entry) => entry.status !== "declined") ?? [];

  const invite = () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    addCollaborator.mutate({
      listId: list.id,
      email: normalizedEmail,
      role,
      recursive,
    });
  };

  const roleLabel = (value: "viewer" | "editor") =>
    t(
      value === "viewer"
        ? "lists.collaborators.viewer"
        : "lists.collaborators.editor",
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            {readOnly
              ? t("lists.collaborators.collaborators")
              : t("lists.collaborators.manage")}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? t("lists.collaborators.people_with_access")
              : t("lists.collaboration.stable_description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!readOnly && (
            <div className="space-y-3">
              <Label>{t("lists.collaborators.add")}</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <Input
                  type="email"
                  value={email}
                  placeholder={t("lists.collaborators.enter_email")}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") invite();
                  }}
                />
                <Select
                  value={role}
                  onValueChange={(value) =>
                    setRole(value as "viewer" | "editor")
                  }
                >
                  <SelectTrigger
                    aria-label={t("lists.collaboration.invitation_role")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      {t("lists.collaborators.viewer")}
                    </SelectItem>
                    <SelectItem value="editor">
                      {t("lists.collaborators.editor")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="gap-2"
                  onClick={invite}
                  disabled={addCollaborator.isPending || !email.trim()}
                >
                  {addCollaborator.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  {t("lists.collaboration.invite")}
                </Button>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={recursive}
                  onChange={(event) => setRecursive(event.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    {t("lists.collaboration.share_all_nested")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("lists.collaboration.share_all_nested_description")}
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="space-y-3">
            <Label>{t("lists.collaborators.current")}</Label>
            {isLoading ? (
              <CapturedSkeleton
                name="collaborators"
                bones={collaboratorsBones}
              />
            ) : (
              <CollaboratorsContent
                owner={data?.owner}
                collaborators={visibleCollaborators}
                renderActions={(collaborator) => {
                  const pending = collaborator.status === "pending";
                  const expired = pending && collaborator.expired;
                  const manageable = canManageCollaboratorOnList(collaborator);
                  return readOnly || collaborator.inherited ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {roleLabel(collaborator.role)}
                      </span>
                      {!readOnly &&
                        collaborator.inherited &&
                        collaborator.user.email && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEmail(collaborator.user.email ?? "");
                              setRole(collaborator.role);
                              setRecursive(false);
                            }}
                          >
                            {t("lists.collaboration.override_here")}
                          </Button>
                        )}
                    </div>
                  ) : pending ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={collaborator.role}
                        disabled={expired}
                        onValueChange={(value) =>
                          updateInvitation.mutate({
                            invitationId: collaborator.id,
                            role: value as "viewer" | "editor",
                            recursive: collaborator.recursive,
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-28"
                          aria-label={t(
                            "lists.collaboration.pending_invitation_role",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">
                            {t("lists.collaborators.viewer")}
                          </SelectItem>
                          <SelectItem value="editor">
                            {t("lists.collaborators.editor")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={collaborator.recursive}
                          disabled={expired}
                          onChange={(event) =>
                            updateInvitation.mutate({
                              invitationId: collaborator.id,
                              role: collaborator.role,
                              recursive: event.target.checked,
                            })
                          }
                        />
                        {t("lists.collaboration.nested_lists")}
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          resendInvitation.mutate({
                            invitationId: collaborator.id,
                          })
                        }
                      >
                        <RefreshCw className="mr-1 size-3" />
                        {t("lists.collaboration.resend")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          revokeInvitation.mutate({
                            invitationId: collaborator.id,
                          })
                        }
                      >
                        {t("lists.collaborators.revoke")}
                      </Button>
                    </div>
                  ) : manageable ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={collaborator.role}
                        onValueChange={(value) =>
                          updateCollaborator.mutate({
                            listId: list.id,
                            userId: collaborator.userId,
                            role: value as "viewer" | "editor",
                            recursive: collaborator.recursive,
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-28"
                          aria-label={t(
                            "lists.collaboration.collaborator_role",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">
                            {t("lists.collaborators.viewer")}
                          </SelectItem>
                          <SelectItem value="editor">
                            {t("lists.collaborators.editor")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={collaborator.recursive}
                          onChange={(event) =>
                            updateCollaborator.mutate({
                              listId: list.id,
                              userId: collaborator.userId,
                              role: collaborator.role,
                              recursive: event.target.checked,
                            })
                          }
                        />
                        {t("lists.collaboration.nested_lists")}
                      </label>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("lists.collaboration.remove_aria", {
                          name: collaborator.user.name,
                        })}
                        onClick={() => {
                          if (
                            window.confirm(
                              t("lists.collaboration.remove_confirmation", {
                                name: collaborator.user.name,
                              }),
                            )
                          ) {
                            removeCollaborator.mutate({
                              listId: list.id,
                              userId: collaborator.userId,
                            });
                          }
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ) : null;
                }}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("actions.close")}</Button>
          </DialogClose>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
