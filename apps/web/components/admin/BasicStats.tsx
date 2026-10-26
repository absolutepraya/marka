"use client";

import { AdminCard } from "@/components/admin/AdminCard";
import { Badge } from "@/components/ui/badge";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  formatServerVersionDisplay,
  normalizeReleaseVersion,
} from "@karakeep/shared/version";

import { BasicStatsContent, MetricValue } from "./BasicStatsContent";
import BasicStatsSkeleton from "./BasicStatsSkeleton";

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
  const { serverRelease, serverVersion, serverCommit, serverCommitShort } =
    useClientConfig();
  const currentVersion = formatServerVersionDisplay({
    version: serverVersion ?? "unknown",
    release: serverRelease ?? null,
    commit: serverCommit ?? null,
    shortCommit: serverCommitShort ?? null,
  });
  const visibleVersion = serverRelease ? `v${currentVersion}` : currentVersion;
  const latestRelease = useLatestRelease();
  const hasUpdate =
    !!serverRelease && !!latestRelease && serverRelease !== latestRelease;

  return (
    <div className="space-y-2">
      <MetricValue>{visibleVersion}</MetricValue>
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

export default function BasicStats() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: serverStats } = useQuery(
    api.admin.stats.queryOptions(undefined, {
      refetchInterval: 5000,
    }),
  );

  return (
    <AdminCard>
      {serverStats ? (
        <BasicStatsContent
          numUsers={serverStats.numUsers}
          numBookmarks={serverStats.numBookmarks}
          version={<ReleaseInfo />}
          labels={{
            heading: t("admin.server_stats.server_stats"),
            description: t("admin.server_stats.description"),
            users: t("admin.server_stats.total_users"),
            bookmarks: t("admin.server_stats.total_bookmarks"),
            version: t("admin.server_stats.server_version"),
          }}
        />
      ) : (
        <BasicStatsSkeleton />
      )}
    </AdminCard>
  );
}
