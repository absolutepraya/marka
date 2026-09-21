"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, Users } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { normalizeReleaseVersion } from "@karakeep/shared/version";

const REPO_LATEST_RELEASE_API =
  "https://api.github.com/repos/absolutepraya/marka/releases/latest";
const REPO_RELEASE_PAGE = "https://github.com/absolutepraya/marka/releases";

function useLatestRelease() {
  const { disableNewReleaseCheck } = useClientConfig();
  const { data } = useQuery({
    queryKey: ["latest-release"],
    queryFn: async () => {
      const res = await fetch(REPO_LATEST_RELEASE_API);
      if (!res.ok) {
        return undefined;
      }
      const data = (await res.json()) as { tag_name?: unknown };
      return normalizeReleaseVersion(
        typeof data.tag_name === "string" ? data.tag_name : null,
      );
    },
    staleTime: 60 * 60 * 1000,
    enabled: !disableNewReleaseCheck,
  });
  return data;
}

function ReleaseInfo() {
  const { serverRelease, serverVersion } = useClientConfig();
  const currentRelease = serverRelease
    ? `v${serverRelease}`
    : (serverVersion ?? "unknown");
  const latestRelease = useLatestRelease();
  const hasUpdate =
    !!serverRelease && !!latestRelease && serverRelease !== latestRelease;

  return (
    <div className="space-y-2">
      <p className="text-3xl font-semibold tracking-tight text-foreground">
        {currentRelease}
      </p>
      {hasUpdate && (
        <a
          href={REPO_RELEASE_PAGE}
          target="_blank"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
          rel="noreferrer"
          title="Update available"
        >
          Update available
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            v{latestRelease}
          </Badge>
        </a>
      )}
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex size-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      </div>
      {value}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <AdminCard>
      <div className="mb-4 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4"
          >
            <Skeleton className="mb-4 h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </AdminCard>
  );
}

export default function BasicStats() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: serverStats } = useQuery(
    api.admin.stats.queryOptions(undefined, {
      refetchInterval: 5000,
    }),
  );

  if (!serverStats) {
    return <StatsSkeleton />;
  }

  return (
    <AdminCard>
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {t("admin.server_stats.server_stats")}
        </h2>
        <p className="text-sm text-muted-foreground">
          Core usage and release signals for the current instance.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricTile
          label={t("admin.server_stats.total_users")}
          value={
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {serverStats.numUsers}
            </p>
          }
          icon={<Users className="h-4 w-4" />}
        />
        <MetricTile
          label={t("admin.server_stats.total_bookmarks")}
          value={
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {serverStats.numBookmarks}
            </p>
          }
          icon={<BookOpen className="h-4 w-4" />}
        />
        <MetricTile
          label={t("admin.server_stats.server_version")}
          value={<ReleaseInfo />}
          icon={<Download className="h-4 w-4" />}
        />
      </div>
    </AdminCard>
  );
}
