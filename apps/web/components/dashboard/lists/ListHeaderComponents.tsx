import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Globe, Lock, Users } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

export function ListPrivacyLabel({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: collaboratorsData } = useQuery(
    api.lists.getCollaborators.queryOptions(
      { listId: list.id },
      {
        enabled: list.userRole === "owner" && list.type === "manual",
      },
    ),
  );
  const hasAcceptedCollaborators =
    collaboratorsData?.collaborators.some(
      (collaborator) => collaborator.status === "accepted",
    ) ?? false;

  const privacy = list.public
    ? { Icon: Globe, label: t("lists.privacy.public") }
    : list.hasCollaborators || hasAcceptedCollaborators
      ? { Icon: Users, label: t("lists.privacy.shared") }
      : { Icon: Lock, label: t("lists.privacy.private") };
  const PrivacyIcon = privacy.Icon;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      {privacy.label}
      <PrivacyIcon aria-hidden="true" className="size-3.5 shrink-0" />
    </span>
  );
}

export function ListCollaboratorsIcons({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const api = useTRPC();
  const { data: collaboratorsData } = useQuery(
    api.lists.getCollaborators.queryOptions(
      { listId: list.id },
      {
        refetchOnWindowFocus: false,
        enabled: list.userRole === "owner" && list.type === "manual",
      },
    ),
  );
  const acceptedCollaborators =
    collaboratorsData?.collaborators.filter(
      (collaborator) => collaborator.status === "accepted",
    ) ?? [];

  if (acceptedCollaborators.length === 0) {
    return null;
  }

  return (
    <div className={cn("group flex items-center", className)}>
      {acceptedCollaborators.map((collaborator) => (
        <Tooltip key={collaborator.userId}>
          <TooltipTrigger>
            <div className="ease-(--ease-out) -mr-2 transition-[margin-right] duration-200 group-hover:mr-1">
              <UserAvatar
                name={collaborator.user.name}
                image={collaborator.user.image}
                className="size-5 shrink-0 rounded-full ring-2 ring-background"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{collaborator.user.name}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function ListItemCount({
  list,
  className,
}: {
  list: ZBookmarkList;
  className?: string;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const { data: statsData } = useQuery(
    api.lists.stats.queryOptions(undefined, {
      placeholderData: keepPreviousData,
      enabled: !!list?.id,
    }),
  );
  const itemCount = statsData?.stats.get(list.id);

  return (
    itemCount !== undefined && (
      <div className={className}>
        <span>{t("lists.items_count", { count: itemCount })}</span>
      </div>
    )
  );
}
