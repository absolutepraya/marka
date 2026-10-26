"use client";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import resultBones from "@/components/loading-ui/bones/import-results.bones.json";
import bones from "@/components/loading-ui/bones/import-detail.bones.json";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useDeleteImportSession,
  useFinalizeImportStaging,
  useImportSessionResults,
  useImportSessionStats,
  usePauseImportSession,
  useResumeImportSession,
} from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Paperclip,
  Pause,
  Play,
  Trash2,
  Upload,
} from "lucide-react";
import { useInView } from "react-intersection-observer";

import type { ZImportSessionStatus } from "@karakeep/shared/types/importSessions";
import { switchCase } from "@karakeep/shared/utils/switch";

type FilterType =
  | "all"
  | "accepted"
  | "rejected"
  | "skipped_duplicate"
  | "pending";

type SimpleTFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface ImportSessionResultItem {
  id: string;
  title: string | null;
  url: string | null;
  content: string | null;
  type: string;
  status: string;
  result: string | null;
  resultReason: string | null;
  resultBookmarkId: string | null;
}

function getStatusTone(status: string) {
  switch (status) {
    case "staging":
      return "border-primary/20 bg-primary/10 text-primary";
    case "pending":
      return "border-border/70 bg-muted/70 text-muted-foreground";
    case "running":
      return "border-info/20 bg-info/10 text-info";
    case "paused":
      return "border-warning/25 bg-warning/10 text-warning";
    case "completed":
      return "border-success/25 bg-success/10 text-success";
    case "failed":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    default:
      return "border-border/70 bg-muted/70 text-muted-foreground";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "staging":
      return <Upload className="h-4 w-4" />;
    case "pending":
      return <Clock className="h-4 w-4" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case "paused":
      return <Pause className="h-4 w-4" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function getResultBadge(
  status: string,
  result: string | null,
  t: (key: string) => string,
) {
  if (status === "pending") {
    return (
      <Badge
        variant="secondary"
        className="border border-border/70 bg-muted/70 text-muted-foreground"
      >
        <Clock className="mr-1 h-3 w-3" />
        {t("settings.import_sessions.detail.result_pending")}
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge
        variant="secondary"
        className="border-info/20 bg-info/10 text-info border"
      >
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {t("settings.import_sessions.detail.result_processing")}
      </Badge>
    );
  }
  switch (result) {
    case "accepted":
      return (
        <Badge
          variant="secondary"
          className="border-success/20 bg-success/10 text-success border"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t("settings.import_sessions.detail.result_accepted")}
        </Badge>
      );
    case "rejected":
      return (
        <Badge
          variant="secondary"
          className="border border-destructive/20 bg-destructive/10 text-destructive"
        >
          <AlertCircle className="mr-1 h-3 w-3" />
          {t("settings.import_sessions.detail.result_rejected")}
        </Badge>
      );
    case "skipped_duplicate":
      return (
        <Badge
          variant="secondary"
          className="border-warning/20 bg-warning/10 text-warning border"
        >
          {t("settings.import_sessions.detail.result_skipped_duplicate")}
        </Badge>
      );
    default:
      return (
        <Badge
          variant="secondary"
          className="border border-border/70 bg-muted/70 text-muted-foreground"
        >
          —
        </Badge>
      );
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "link":
      return <Globe className="h-3 w-3" />;
    case "text":
      return <FileText className="h-3 w-3" />;
    case "asset":
      return <Paperclip className="h-3 w-3" />;
    default:
      return null;
  }
}

function getTypeLabel(type: string, t: SimpleTFunction) {
  switch (type) {
    case "link":
      return t("common.bookmark_types.link");
    case "text":
      return t("common.bookmark_types.text");
    case "asset":
      return t("common.bookmark_types.media");
    default:
      return type;
  }
}

function getTitleDisplay(
  item: {
    title: string | null;
    url: string | null;
    content: string | null;
    type: string;
  },
  noTitleLabel: string,
) {
  if (item.title) {
    return item.title;
  }
  if (item.type === "text" && item.content) {
    return item.content.length > 80
      ? item.content.substring(0, 80) + "…"
      : item.content;
  }
  if (item.url) {
    try {
      const url = new URL(item.url);
      const display = url.hostname + url.pathname;
      return display.length > 60 ? display.substring(0, 60) + "…" : display;
    } catch {
      return item.url.length > 60 ? item.url.substring(0, 60) + "…" : item.url;
    }
  }
  return noTitleLabel;
}

function MetricPill({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "success" | "warning" | "destructive" | "info";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "muted" && "border-border/70 bg-background/70",
        tone === "success" && "border-success/20 bg-success/10",
        tone === "warning" && "border-warning/20 bg-warning/10",
        tone === "destructive" && "border-destructive/20 bg-destructive/10",
        tone === "info" && "border-info/20 bg-info/10",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

export default function ImportSessionDetail({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t: tRaw } = useTranslation();
  const t = tRaw as SimpleTFunction;
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>("all");

  const { data: stats, isLoading: isStatsLoading } =
    useImportSessionStats(sessionId);
  const {
    data: resultsData,
    isLoading: isResultsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useImportSessionResults(sessionId, filter);

  const deleteSession = useDeleteImportSession();
  const finalizeSession = useFinalizeImportStaging();
  const pauseSession = usePauseImportSession();
  const resumeSession = useResumeImportSession();

  const { ref: loadMoreRef, inView: loadMoreInView } = useInView();

  useEffect(() => {
    if (loadMoreInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadMoreInView]);

  if (isStatsLoading) {
    return <CapturedSkeleton name="import-detail" bones={bones} />;
  }

  if (!stats) {
    return null;
  }

  const items: ImportSessionResultItem[] =
    resultsData?.pages.flatMap((page) => page.items) ?? [];

  const canDelete =
    stats.status === "staging" ||
    stats.status === "completed" ||
    stats.status === "failed" ||
    stats.status === "paused";
  const canFinalize = stats.status === "staging" && stats.totalBookmarks > 0;
  const canPause = stats.status === "pending" || stats.status === "running";
  const canResume = stats.status === "paused";

  const handleDelete = () => {
    deleteSession.mutateAsync({ importSessionId: sessionId }).then(() => {
      router.push("/settings/import");
    });
  };

  return (
    <ImportSessionDetailContent
      stats={stats}
      filter={filter}
      setFilter={setFilter}
      createdDescription={`Created ${formatDistanceToNow(stats.createdAt, { addSuffix: true })}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canPause && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                pauseSession.mutate({ importSessionId: sessionId })
              }
              disabled={pauseSession.isPending}
            >
              <Pause className="mr-1 h-4 w-4" />
              {t("settings.import_sessions.pause_session")}
            </Button>
          )}
          {canFinalize && (
            <ActionConfirmingDialog
              title={t("settings.import_sessions.finalize_dialog_title")}
              description={
                <div>
                  {t("settings.import_sessions.finalize_dialog_description", {
                    name: stats.name,
                  })}
                </div>
              }
              actionButton={(setDialogOpen) => (
                <Button
                  onClick={() => {
                    finalizeSession.mutateAsync({
                      importSessionId: sessionId,
                    });
                    setDialogOpen(false);
                  }}
                  disabled={finalizeSession.isPending}
                >
                  {t("settings.import_sessions.finalize_staging")}
                </Button>
              )}
            >
              <Button size="sm" disabled={finalizeSession.isPending}>
                <Play className="mr-1 h-4 w-4" />
                {t("settings.import_sessions.finalize_staging")}
              </Button>
            </ActionConfirmingDialog>
          )}
          {canResume && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                resumeSession.mutate({ importSessionId: sessionId })
              }
              disabled={resumeSession.isPending}
            >
              <Play className="mr-1 h-4 w-4" />
              {t("settings.import_sessions.resume_session")}
            </Button>
          )}
          {canDelete && (
            <ActionConfirmingDialog
              title={t("settings.import_sessions.delete_dialog_title")}
              description={
                <div>
                  {t("settings.import_sessions.delete_dialog_description", {
                    name: stats.name,
                  })}
                </div>
              }
              actionButton={(setDialogOpen) => (
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete();
                    setDialogOpen(false);
                  }}
                  disabled={deleteSession.isPending}
                >
                  {t("settings.import_sessions.delete_session")}
                </Button>
              )}
            >
              <Button
                variant="destructiveOutline"
                size="sm"
                disabled={deleteSession.isPending}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {t("actions.delete")}
              </Button>
            </ActionConfirmingDialog>
          )}
        </div>
      }
      results={
        isResultsLoading ? (
          <CapturedSkeleton name="import-results" bones={resultBones} />
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("settings.import_sessions.detail.no_results")}
          </div>
        ) : (
          <ImportResultsTable
            items={items}
            pagination={
              hasNextPage && (
                <div className="flex justify-center pb-2 pt-1">
                  <ActionButton
                    ref={loadMoreRef}
                    ignoreDemoMode={true}
                    loading={isFetchingNextPage}
                    onClick={() => fetchNextPage()}
                    variant="ghost"
                  >
                    {t("settings.import_sessions.detail.load_more")}
                  </ActionButton>
                </div>
              )
            }
          />
        )
      }
    />
  );
}

export function ImportSessionDetailContent({
  stats,
  filter,
  setFilter,
  actions,
  results,
  createdDescription,
}: {
  stats: NonNullable<ReturnType<typeof useImportSessionStats>["data"]>;
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
  actions: React.ReactNode;
  results: React.ReactNode;
  createdDescription: string;
}) {
  const { t: tRaw } = useTranslation();
  const t = tRaw as SimpleTFunction;
  const progress =
    stats.totalBookmarks > 0
      ? ((stats.completedBookmarks + stats.failedBookmarks) /
          stats.totalBookmarks) *
        100
      : 0;

  const statusLabels = (s: ZImportSessionStatus) =>
    switchCase(s, {
      staging: t("settings.import_sessions.status.staging"),
      pending: t("settings.import_sessions.status.pending"),
      running: t("settings.import_sessions.status.running"),
      paused: t("settings.import_sessions.status.paused"),
      completed: t("settings.import_sessions.status.completed"),
      failed: t("settings.import_sessions.status.failed"),
    });

  return (
    <div className="space-y-4">
      <Link
        href="/settings/import"
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("settings.import_sessions.detail.back_to_import")}
      </Link>

      <SettingsPage
        title={stats.name}
        description={createdDescription}
        icon={<Upload className="size-6 shrink-0 text-muted-foreground" />}
        action={
          <Badge
            variant="secondary"
            className={cn("gap-1.5 border", getStatusTone(stats.status))}
          >
            {getStatusIcon(stats.status)}
            <span>{statusLabels(stats.status)}</span>
          </Badge>
        }
      >
        <SettingsSection
          title="Session overview"
          description="Track progress, inspect the final destination list, and manage the session lifecycle."
          action={actions}
        >
          <div className="space-y-4">
            <div className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("settings.import_sessions.progress")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stats.completedBookmarks + stats.failedBookmarks} of{" "}
                    {stats.totalBookmarks} processed
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-muted/60 text-muted-foreground"
                >
                  {Math.round(progress)}%
                </Badge>
              </div>
              {stats.totalBookmarks > 0 ? (
                <Progress value={progress} className="h-2.5" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Waiting for bookmarks to be staged into this session.
                </p>
              )}
            </div>

            {stats.totalBookmarks > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricPill
                  label="Pending"
                  value={stats.pendingBookmarks}
                  tone="warning"
                />
                <MetricPill
                  label="Processing"
                  value={stats.processingBookmarks}
                  tone="info"
                />
                <MetricPill
                  label="Completed"
                  value={stats.completedBookmarks}
                  tone="success"
                />
                <MetricPill
                  label="Failed"
                  value={stats.failedBookmarks}
                  tone="destructive"
                />
              </div>
            )}

            {(stats.rootListId || stats.message) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {stats.rootListId && (
                  <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>{t("settings.import_sessions.imported_to")}</span>
                    </div>
                    <Link
                      href={`/dashboard/lists/${stats.rootListId}`}
                      className="mt-2 inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
                      target="_blank"
                    >
                      {t("settings.import_sessions.view_list")}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
                {stats.message && (
                  <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    {stats.message}
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Imported items"
          description="Filter the run, inspect decisions, and jump directly to the created bookmark when available."
        >
          <div className="space-y-4">
            <Tabs
              value={filter}
              onValueChange={(value) => setFilter(value as FilterType)}
              className="w-full"
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/70 bg-background/80 p-1 sm:grid-cols-5">
                <TabsTrigger value="all">
                  {t("settings.import_sessions.detail.filter_all")}
                </TabsTrigger>
                <TabsTrigger value="accepted">
                  {t("settings.import_sessions.detail.filter_accepted")}
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  {t("settings.import_sessions.detail.filter_rejected")}
                </TabsTrigger>
                <TabsTrigger value="skipped_duplicate">
                  {t("settings.import_sessions.detail.filter_duplicates")}
                </TabsTrigger>
                <TabsTrigger value="pending">
                  {t("settings.import_sessions.detail.filter_pending")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="shadow-xs overflow-hidden rounded-xl border border-border/70 bg-background/80">
              {results}
            </div>
          </div>
        </SettingsSection>
      </SettingsPage>
    </div>
  );
}

export function ImportResultsTable({
  items,
  pagination,
}: {
  items: ImportSessionResultItem[];
  pagination?: React.ReactNode;
}) {
  const { t: tRaw } = useTranslation();
  const t = tRaw as SimpleTFunction;
  return (
    <div className="flex flex-col gap-3 p-1">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {t("settings.import_sessions.detail.table_title")}
            </TableHead>
            <TableHead className="w-[96px]">
              {t("settings.import_sessions.detail.table_type")}
            </TableHead>
            <TableHead className="w-[150px]">
              {t("settings.import_sessions.detail.table_result")}
            </TableHead>
            <TableHead>
              {t("settings.import_sessions.detail.table_reason")}
            </TableHead>
            <TableHead className="w-[120px]">
              {t("settings.import_sessions.detail.table_bookmark")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-[300px] truncate font-medium">
                {getTitleDisplay(
                  item,
                  t("settings.import_sessions.detail.no_title"),
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="flex w-fit items-center gap-1 border-border/70 bg-background/70 text-xs"
                >
                  {getTypeIcon(item.type)}
                  {getTypeLabel(item.type, t)}
                </Badge>
              </TableCell>
              <TableCell>
                {getResultBadge(item.status, item.result, t)}
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                {item.resultReason || "—"}
              </TableCell>
              <TableCell>
                {item.resultBookmarkId ? (
                  <Link
                    href={`/dashboard/preview/${item.resultBookmarkId}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
                    prefetch={false}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("settings.import_sessions.detail.view_bookmark")}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pagination}
    </div>
  );
}
