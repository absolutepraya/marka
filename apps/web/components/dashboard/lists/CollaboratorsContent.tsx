"use client";

import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "@/lib/i18n/client";
import { Clock3 } from "lucide-react";
import { formatInvitationDate } from "./collaborationUi";

type Collaborators = inferRouterOutputs<AppRouter>["lists"]["getCollaborators"];

export function CollaboratorsContent({
  owner,
  collaborators,
  renderActions,
}: {
  owner?: Collaborators["owner"];
  collaborators: Collaborators["collaborators"];
  renderActions: (
    collaborator: Collaborators["collaborators"][number],
  ) => ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {owner && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={owner.name}
              image={owner.image}
              className="size-10"
            />
            <div className="min-w-0">
              <div className="truncate font-medium">{owner.name}</div>
              {owner.email && (
                <div className="truncate text-sm text-muted-foreground">
                  {owner.email}
                </div>
              )}
            </div>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("lists.collaborators.owner")}
          </span>
        </div>
      )}

      {collaborators.map((collaborator) => {
        const pending = collaborator.status === "pending";
        const expired = pending && collaborator.expired;
        return (
          <div key={collaborator.id} className="rounded-lg border p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar
                  name={collaborator.user.name}
                  image={
                    collaborator.status === "accepted"
                      ? collaborator.user.image
                      : null
                  }
                  className="size-10"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">
                      {collaborator.user.name}
                    </span>
                    {pending && (
                      <Badge variant={expired ? "destructive" : "outline"}>
                        {expired
                          ? t("lists.collaboration.expired")
                          : t("lists.collaborators.pending")}
                      </Badge>
                    )}
                    {collaborator.inherited && (
                      <Badge variant="secondary">
                        {t("lists.collaboration.inherited")}
                      </Badge>
                    )}
                    {collaborator.recursive && (
                      <Badge variant="outline">
                        {t("lists.collaboration.nested_lists")}
                      </Badge>
                    )}
                  </div>
                  {collaborator.user.email && (
                    <div className="truncate text-sm text-muted-foreground">
                      {collaborator.user.email}
                    </div>
                  )}
                  {collaborator.inherited && collaborator.sourceListName && (
                    <div className="text-xs text-muted-foreground">
                      {t("lists.collaboration.inherited_from", {
                        name: collaborator.sourceListName,
                      })}
                    </div>
                  )}
                  {pending && collaborator.expiresAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3" />
                      {expired
                        ? t("lists.collaboration.expired")
                        : t("lists.collaboration.expires")}{" "}
                      {formatInvitationDate(collaborator.expiresAt)}
                    </div>
                  )}
                </div>
              </div>

              {renderActions(collaborator)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
