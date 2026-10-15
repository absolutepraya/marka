"use client";

import { useRouter } from "next/navigation";
import { TagOptions } from "@/components/dashboard/tags/TagOptions";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { EditingButton } from "@/components/ui/editing-button";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { Hash, MoreHorizontal } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZGetTagResponse } from "@karakeep/shared/types/tags";

export default function TagHeader({
  initialData,
}: {
  initialData: ZGetTagResponse;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const router = useRouter();
  const { data: tag, error } = useQuery(
    api.tags.get.queryOptions({ tagId: initialData.id }, { initialData }),
  );

  if (error?.data?.code === "NOT_FOUND") {
    router.push("/dashboard/tags");
  }

  const aiCount = tag.numBookmarksByAttachedType.ai ?? 0;
  const humanCount = tag.numBookmarksByAttachedType.human ?? 0;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 basis-40 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center text-muted-foreground">
          <Hash className="size-8" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold leading-tight">
            {tag.name}
          </h1>
          <div className="mt-2 truncate whitespace-nowrap text-sm text-muted-foreground">
            <span>{t("tags.items_count", { count: tag.numBookmarks })}</span>
            {humanCount > 0 && (
              <>
                {", "}
                <span>{t("tags.attached_by_you", { count: humanCount })}</span>
              </>
            )}
            {aiCount > 0 && (
              <>
                {", "}
                <span>{t("tags.attached_by_ai", { count: aiCount })}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <GlobalActions />
        <TagOptions tag={tag}>
          <EditingButton tooltip={t("actions.more")} ignoreDemoMode>
            <MoreHorizontal />
          </EditingButton>
        </TagOptions>
      </div>
    </div>
  );
}
