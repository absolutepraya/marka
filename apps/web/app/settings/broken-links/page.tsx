"use client";

import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { ActionButton } from "@/components/ui/action-button";
import FormattedDate from "@/components/ui/formatted-date";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { toast } from "@/components/ui/sonner";
import { useUndoableBookmarkDeletion } from "@/lib/hooks/useUndoableBookmarkDeletion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as LinkIcon, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useRecrawlBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

export default function BrokenLinksPage() {
  const api = useTRPC();
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(
    api.bookmarks.getBrokenLinks.queryOptions(),
  );

  const { scheduleDelete, pendingBookmarkIds } = useUndoableBookmarkDeletion();
  const pendingBookmarkIdSet = new Set(pendingBookmarkIds);
  const visibleBookmarks =
    data?.bookmarks.filter(
      (bookmark) => !pendingBookmarkIdSet.has(bookmark.id),
    ) ?? [];

  const { mutate: recrawlBookmark, isPending: isRecrawling } =
    useRecrawlBookmark({
      onSuccess: () => {
        toast({
          description: t("toasts.bookmarks.refetch"),
        });
        queryClient.invalidateQueries(
          api.bookmarks.getBrokenLinks.pathFilter(),
        );
      },
      onError: () => {
        toast({
          description: t("common.something_went_wrong"),
          variant: "destructive",
        });
      },
    });

  return (
    <SettingsPage
      title={t("settings.broken_links.broken_links")}
      description={t("settings.broken_links.page_description")}
      icon={<LinkIcon className="size-6 shrink-0 text-muted-foreground" />}
    >
      <SettingsSection>
        {isPending && <FullPageSpinner />}
        {!isPending && data && visibleBookmarks.length == 0 && (
          <p className="rounded-md bg-muted p-3 text-center text-sm text-muted-foreground">
            No broken links found
          </p>
        )}
        {!isPending && data && visibleBookmarks.length > 0 && (
          <Table className="whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3 [&_th]:py-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.url")}</TableHead>
                <TableHead>{t("common.created_at")}</TableHead>
                <TableHead>
                  {t("settings.broken_links.last_crawled_at")}
                </TableHead>
                <TableHead>
                  {t("settings.broken_links.crawling_status")}
                </TableHead>
                <TableHead>{t("common.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleBookmarks.map((b) => (
                <TableRow key={b.id} className="h-12">
                  <TableCell>{b.url}</TableCell>
                  <TableCell>
                    <FormattedDate date={b.createdAt} />
                  </TableCell>
                  <TableCell>
                    <FormattedDate date={b.crawledAt} />
                  </TableCell>
                  <TableCell>
                    {b.isCrawlingFailure ? (
                      <span className="text-red-500">Failed</span>
                    ) : (
                      b.statusCode
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        loading={isRecrawling}
                        onClick={() => recrawlBookmark({ bookmarkId: b.id })}
                        className="h-8 items-center gap-2"
                      >
                        <RefreshCw className="size-4" />
                        {t("actions.recrawl")}
                      </ActionButton>
                      <ActionButton
                        variant="ghostDestructive"
                        size="icon-sm"
                        aria-label={t("actions.delete")}
                        onClick={() => scheduleDelete(b.id)}
                        loading={pendingBookmarkIdSet.has(b.id)}
                      >
                        <Trash2 className="size-4" />
                      </ActionButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
