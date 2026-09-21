"use client";

import { useMemo } from "react";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BarChart3,
  BookOpen,
  Chrome,
  Code,
  Database,
  FileText,
  Globe,
  Hash,
  Heart,
  HelpCircle,
  Highlighter,
  Image,
  Link,
  List,
  Rss,
  Smartphone,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { zBookmarkSourceSchema } from "@karakeep/shared/types/bookmarks";

type BookmarkSource = z.infer<typeof zBookmarkSourceSchema>;

interface RankedItem {
  name: string;
  count: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourLabels = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`,
);

function formatSourceName(source: BookmarkSource | null): string {
  if (!source) return "Unknown";
  const sourceMap: Record<BookmarkSource, string> = {
    api: "API",
    web: "Web",
    extension: "Browser Extension",
    cli: "CLI",
    mobile: "Mobile App",
    singlefile: "SingleFile",
    rss: "RSS Feed",
    import: "Import",
  };
  return sourceMap[source];
}

function getSourceIcon(source: BookmarkSource | null): React.ReactNode {
  const iconProps = { className: "h-4 w-4 text-muted-foreground" };
  switch (source) {
    case "api":
      return <Zap {...iconProps} />;
    case "web":
      return <Globe {...iconProps} />;
    case "extension":
      return <Chrome {...iconProps} />;
    case "cli":
      return <Code {...iconProps} />;
    case "mobile":
      return <Smartphone {...iconProps} />;
    case "singlefile":
      return <FileText {...iconProps} />;
    case "rss":
      return <Rss {...iconProps} />;
    case "import":
      return <Upload {...iconProps} />;
    default:
      return <HelpCircle {...iconProps} />;
  }
}

function SurfacePanel({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shadow-xs min-w-0 rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function InsightTile({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string | number;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="shadow-xs min-w-0 rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-muted-foreground">
          {title}
        </p>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function DistributionRow({
  label,
  count,
  total,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  icon: React.ReactNode;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">{icon}</span>
          <span className="truncate font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-muted/60 text-muted-foreground"
          >
            {Math.round(percentage)}%
          </Badge>
          <span className="text-sm font-medium text-foreground">{count}</span>
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

function RankedList({
  items,
  emptyLabel,
  renderIcon,
}: {
  items: RankedItem[];
  emptyLabel: string;
  renderIcon?: (item: RankedItem, index: number) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => (
        <div
          key={item.name}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {index + 1}
            </div>
            {renderIcon?.(item, index)}
            <span
              className="truncate text-sm font-medium text-foreground"
              title={item.name}
            >
              {item.name}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="bg-muted/60 text-muted-foreground"
          >
            {item.count}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function ActivityBars({
  data,
  maxValue,
  labels,
}: {
  data: number[];
  maxValue: number;
  labels: string[];
}) {
  return (
    <div className="space-y-2.5">
      {data.map((value, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="w-12 text-right text-xs text-muted-foreground">
            {labels[index]}
          </div>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted/80">
            <div
              className="ease-(--ease-out) h-full rounded-full bg-primary transition-[width] duration-300"
              style={{
                width: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="w-8 text-right text-xs font-medium text-muted-foreground">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  const { t } = useTranslation();

  return (
    <SettingsPage
      title={t("settings.stats.usage_statistics")}
      description={t("settings.stats.insights_description")}
      icon={<BarChart3 className="size-6 shrink-0 text-muted-foreground" />}
    >
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shadow-xs rounded-xl border border-border/70 bg-card/90 p-4"
            >
              <Skeleton className="mb-4 h-4 w-24" />
              <Skeleton className="mb-2 h-8 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="shadow-xs rounded-2xl border border-border/70 bg-card/90 p-5"
            >
              <Skeleton className="mb-2 h-5 w-36" />
              <Skeleton className="mb-5 h-4 w-56" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j}>
                    <div className="mb-2 flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}

export default function StatsPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  const { data: stats, isLoading } = useQuery(api.users.stats.queryOptions());
  const { data: userSettings } = useQuery(api.users.settings.queryOptions());

  const maxHourlyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byHour.map(
        (h: { hour: number; count: number }) => h.count,
      ),
    );
  }, [stats]);

  const maxDailyActivity = useMemo(() => {
    if (!stats) return 0;
    return Math.max(
      ...stats.bookmarkingActivity.byDayOfWeek.map(
        (d: { day: number; count: number }) => d.count,
      ),
    );
  }, [stats]);

  if (isLoading) {
    return <StatsSkeleton />;
  }

  if (!stats) {
    return (
      <SettingsPage
        title={t("settings.stats.usage_statistics")}
        description={t("settings.stats.insights_description")}
        icon={<BarChart3 className="size-6 shrink-0 text-muted-foreground" />}
      >
        <SettingsSection title="Unable to load statistics">
          <p className="text-sm text-muted-foreground">
            {t("settings.stats.failed_to_load")}
          </p>
        </SettingsSection>
      </SettingsPage>
    );
  }

  const topDomains = stats.topDomains
    .slice(0, 6)
    .map((domain: { domain: string; count: number }) => ({
      name: domain.domain,
      count: domain.count,
    }));
  const topTags = stats.tagUsage
    .slice(0, 6)
    .map((tag: { name: string; count: number }) => ({
      name: tag.name,
      count: tag.count,
    }));

  return (
    <SettingsPage
      title={t("settings.stats.usage_statistics")}
      description={t("settings.stats.insights_description")}
      icon={<BarChart3 className="size-6 shrink-0 text-muted-foreground" />}
    >
      <SettingsSection
        title="At a glance"
        description="The primary signals that describe the shape of your library right now."
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InsightTile
              title={t("settings.stats.overview.total_bookmarks")}
              value={formatNumber(stats.numBookmarks)}
              detail={t("settings.stats.overview.all_saved_items")}
              icon={<BookOpen className="h-4 w-4" />}
            />
            <InsightTile
              title={t("settings.stats.overview.this_month")}
              value={formatNumber(stats.bookmarkingActivity.thisMonth)}
              detail={t("settings.stats.overview.bookmarks_added")}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <InsightTile
              title={t("settings.stats.overview.highlights")}
              value={formatNumber(stats.numHighlights)}
              detail={t("settings.stats.overview.text_highlights")}
              icon={<Highlighter className="h-4 w-4" />}
            />
            <InsightTile
              title={t("settings.stats.overview.storage_used")}
              value={formatBytes(stats.totalAssetSize)}
              detail={t("settings.stats.overview.total_asset_storage")}
              icon={<Database className="h-4 w-4" />}
            />
          </div>

          <SurfacePanel
            title="Recent cadence"
            description="How quickly your collection has been growing recently."
          >
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <MiniMetric
                label={t("settings.stats.recent_activity.this_week")}
                value={formatNumber(stats.bookmarkingActivity.thisWeek)}
              />
              <MiniMetric
                label={t("settings.stats.recent_activity.this_month")}
                value={formatNumber(stats.bookmarkingActivity.thisMonth)}
              />
              <MiniMetric
                label={t("settings.stats.recent_activity.this_year")}
                value={formatNumber(stats.bookmarkingActivity.thisYear)}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className="bg-muted/60 text-muted-foreground"
              >
                <Heart className="mr-1.5 h-3 w-3" />
                {formatNumber(stats.numFavorites)} favorites
              </Badge>
              <Badge
                variant="secondary"
                className="bg-muted/60 text-muted-foreground"
              >
                <Archive className="mr-1.5 h-3 w-3" />
                {formatNumber(stats.numArchived)} archived
              </Badge>
              <Badge
                variant="secondary"
                className="bg-muted/60 text-muted-foreground"
              >
                <List className="mr-1.5 h-3 w-3" />
                {formatNumber(stats.numLists)} lists
              </Badge>
              <Badge
                variant="secondary"
                className="bg-muted/60 text-muted-foreground"
              >
                <Hash className="mr-1.5 h-3 w-3" />
                {formatNumber(stats.numTags)} tags
              </Badge>
            </div>
          </SurfacePanel>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Collection makeup"
        description="What you save most often, where it comes from, and the domains and tags that dominate your library."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SurfacePanel
            title={t("settings.stats.bookmark_types.title")}
            description="A quick breakdown of the kinds of bookmarks you save most often."
          >
            <div className="space-y-4">
              <DistributionRow
                label={t("settings.stats.bookmark_types.links")}
                count={stats.bookmarksByType.link}
                total={stats.numBookmarks}
                icon={<Link className="h-4 w-4" />}
              />
              <DistributionRow
                label={t("settings.stats.bookmark_types.text_notes")}
                count={stats.bookmarksByType.text}
                total={stats.numBookmarks}
                icon={<FileText className="h-4 w-4" />}
              />
              <DistributionRow
                label={t("settings.stats.bookmark_types.assets")}
                count={stats.bookmarksByType.asset}
                total={stats.numBookmarks}
                icon={<Image className="h-4 w-4" />}
              />
            </div>
          </SurfacePanel>

          <SurfacePanel
            title={t("settings.stats.bookmark_sources.title")}
            description="The entry points that matter most in your saving workflow."
          >
            {stats.bookmarksBySource.length > 0 ? (
              <div className="space-y-2.5">
                {stats.bookmarksBySource.map(
                  (source: {
                    source: BookmarkSource | null;
                    count: number;
                  }) => (
                    <div
                      key={source.source || "unknown"}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {getSourceIcon(source.source)}
                        <span className="truncate text-sm font-medium text-foreground">
                          {formatSourceName(source.source)}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-muted/60 text-muted-foreground"
                      >
                        {source.count}
                      </Badge>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("settings.stats.bookmark_sources.empty")}
              </p>
            )}
          </SurfacePanel>

          <SurfacePanel
            title={t("settings.stats.top_domains.title")}
            description="The sites that show up most often across your saved links."
          >
            <RankedList
              items={topDomains}
              emptyLabel={t("settings.stats.top_domains.no_domains_found")}
            />
          </SurfacePanel>

          <SurfacePanel
            title={t("settings.stats.most_used_tags.title")}
            description="The tags you rely on most to organise the collection."
          >
            <RankedList
              items={topTags}
              emptyLabel={t("settings.stats.most_used_tags.no_tags_found")}
            />
          </SurfacePanel>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Behavior patterns"
        description="When you are most active, shown in your current timezone when available."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <SurfacePanel
            title={t("settings.stats.activity_patterns.activity_by_hour")}
            description={
              userSettings?.timezone && userSettings.timezone !== "UTC"
                ? `Timezone: ${userSettings.timezone}`
                : "Hourly distribution across your saves."
            }
          >
            <ActivityBars
              data={stats.bookmarkingActivity.byHour.map(
                (hour: { hour: number; count: number }) => hour.count,
              )}
              maxValue={maxHourlyActivity}
              labels={hourLabels}
            />
          </SurfacePanel>

          <SurfacePanel
            title={t("settings.stats.activity_patterns.activity_by_day")}
            description={
              userSettings?.timezone && userSettings.timezone !== "UTC"
                ? `Timezone: ${userSettings.timezone}`
                : "Weekly rhythm across the days you save most often."
            }
          >
            <ActivityBars
              data={stats.bookmarkingActivity.byDayOfWeek.map(
                (day: { day: number; count: number }) => day.count,
              )}
              maxValue={maxDailyActivity}
              labels={dayNames}
            />
          </SurfacePanel>
        </div>
      </SettingsSection>

      {stats.assetsByType.length > 0 && (
        <SettingsSection
          title={t("settings.stats.storage_breakdown.title")}
          description="How your stored assets contribute to the total space used by your library."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.assetsByType.map(
              (asset: { type: string; count: number; totalSize: number }) => {
                const percentage =
                  stats.totalAssetSize > 0
                    ? (asset.totalSize / stats.totalAssetSize) * 100
                    : 0;

                return (
                  <SurfacePanel
                    key={asset.type}
                    title={asset.type
                      .replace(/([A-Z])/g, " $1")
                      .trim()
                      .replace(/^./, (character) => character.toUpperCase())}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge
                          variant="secondary"
                          className="bg-muted/60 text-muted-foreground"
                        >
                          {asset.count} items
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {formatBytes(asset.totalSize)}
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                      <p className="text-sm text-muted-foreground">
                        {Math.round(percentage)}% of stored asset size
                      </p>
                    </div>
                  </SurfacePanel>
                );
              },
            )}
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
