"use client";

import Link from "next/link";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useDeleteImportSession,
  useFinalizeImportStaging,
  useImportSessionStats,
  usePauseImportSession,
  useResumeImportSession,
} from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Trash2,
  Upload,
} from "lucide-react";

import type {
  ZImportSessionStatus,
  ZImportSessionWithStats,
} from "@karakeep/shared/types/importSessions";
import { switchCase } from "@karakeep/shared/utils/switch";

interface ImportSessionCardProps {
  session: ZImportSessionWithStats;
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

function StatPill({
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

export function ImportSessionCard({ session }: ImportSessionCardProps) {
  const { t } = useTranslation();
  const { data: liveStats } = useImportSessionStats(session.id);
  const deleteSession = useDeleteImportSession();
  const finalizeSession = useFinalizeImportStaging();
  const pauseSession = usePauseImportSession();
  const resumeSession = useResumeImportSession();

  const stats = liveStats || session;
  const canDelete =
    stats.status === "staging" ||
    stats.status === "completed" ||
    stats.status === "failed" ||
    stats.status === "paused";

  const canFinalize = stats.status === "staging" && stats.totalBookmarks > 0;
  const canPause = stats.status === "pending" || stats.status === "running";
  const canResume = stats.status === "paused";

  return (
    <ImportSessionCardContent
      session={session}
      stats={stats}
      createdAtLabel={t("settings.import_sessions.created_at", {
        time: formatDistanceToNow(session.createdAt, { addSuffix: true }),
      })}
      actions={
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/settings/import/${session.id}`}>
              <ExternalLink className="mr-1 h-4 w-4" />
              {t("settings.import_sessions.view_details")}
            </Link>
          </Button>
          {canPause && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                pauseSession.mutate({ importSessionId: session.id })
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
                    name: session.name,
                  })}
                </div>
              }
              actionButton={(setDialogOpen) => (
                <Button
                  onClick={() => {
                    finalizeSession.mutateAsync({
                      importSessionId: session.id,
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
                resumeSession.mutate({ importSessionId: session.id })
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
                    name: session.name,
                  })}
                </div>
              }
              actionButton={(setDialogOpen) => (
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteSession.mutateAsync({
                      importSessionId: session.id,
                    });
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
    />
  );
}

export function ImportSessionCardContent({
  session,
  stats,
  actions,
  createdAtLabel,
}: {
  session: ZImportSessionWithStats;
  stats: ZImportSessionWithStats;
  actions: React.ReactNode;
  createdAtLabel: string;
}) {
  const { t } = useTranslation();
  const statusLabels = (s: ZImportSessionStatus) =>
    switchCase(s, {
      staging: t("settings.import_sessions.status.staging"),
      pending: t("settings.import_sessions.status.pending"),
      running: t("settings.import_sessions.status.running"),
      paused: t("settings.import_sessions.status.paused"),
      completed: t("settings.import_sessions.status.completed"),
      failed: t("settings.import_sessions.status.failed"),
    });

  const progress =
    stats.totalBookmarks > 0
      ? ((stats.completedBookmarks + stats.failedBookmarks) /
          stats.totalBookmarks) *
        100
      : 0;

  return (
    <div className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4 transition-shadow duration-200 hover:shadow-sm">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {session.name}
              </h3>
              <Badge
                variant="secondary"
                className={cn("gap-1.5 border", getStatusTone(stats.status))}
              >
                {getStatusIcon(stats.status)}
                <span>{statusLabels(stats.status)}</span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{createdAtLabel}</p>
          </div>

          {actions}
        </div>

        <div className="rounded-xl border border-border/70 bg-card/50 p-4">
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
              Waiting for bookmarks to enter the session.
            </p>
          )}
        </div>

        {stats.totalBookmarks > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatPill
              label={t("settings.import_sessions.badges.pending", {
                count: 0,
              }).replace("0 ", "")}
              value={stats.pendingBookmarks}
              tone="warning"
            />
            <StatPill
              label={t("settings.import_sessions.badges.processing", {
                count: 0,
              }).replace("0 ", "")}
              value={stats.processingBookmarks}
              tone="info"
            />
            <StatPill
              label={t("settings.import_sessions.badges.completed", {
                count: 0,
              }).replace("0 ", "")}
              value={stats.completedBookmarks}
              tone="success"
            />
            <StatPill
              label={t("settings.import_sessions.badges.failed", {
                count: 0,
              }).replace("0 ", "")}
              value={stats.failedBookmarks}
              tone="destructive"
            />
          </div>
        )}

        {(session.rootListId || stats.message) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {session.rootListId && (
              <div className="rounded-xl border border-border/70 bg-background/70 p-3.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                  <span>{t("settings.import_sessions.imported_to")}</span>
                </div>
                <Link
                  href={`/dashboard/lists/${session.rootListId}`}
                  className="mt-2 inline-flex items-center gap-1 font-medium text-primary transition-colors hover:text-primary/80"
                  target="_blank"
                >
                  {t("settings.import_sessions.view_list")}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {stats.message && (
              <div className="rounded-xl border border-border/70 bg-background/70 p-3.5 text-sm text-muted-foreground">
                {stats.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
