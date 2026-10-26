"use client";

import { Fragment } from "react";
import type { ZImportSessionWithStats } from "@karakeep/shared/types/importSessions";
import type { ZHighlight } from "@karakeep/shared/types/highlights";
import { FeedRowContent, FeedsTable } from "@/components/settings/FeedSettings";
import {
  WebhookRowContent,
  WebhooksTable,
} from "@/components/settings/WebhookSettings";
import {
  BackupRowContent,
  BackupsTable,
} from "@/components/settings/BackupSettings";
import { AssetsSettingsContent } from "@/components/settings/AssetsSettings";
import { BrokenLinksSettingsContent } from "@/components/settings/BrokenLinksSettings";
import { PromptRowLayout } from "@/components/settings/AISettings";
import { ImportSessionCardContent } from "@/components/settings/ImportSessionCard";
import {
  ImportSessionDetailContent,
  ImportResultsTable,
} from "@/components/settings/ImportSessionDetail";
import { RuleListContent } from "@/components/dashboard/rules/RuleEngineRuleList";
import { HighlightCardContent } from "@/components/dashboard/highlights/HighlightCard";
import { HighlightRowContent } from "@/components/dashboard/highlights/AllHighlights";
import { EditingButton } from "@/components/ui/editing-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/client";
import {
  ArrowDownToLine,
  Download,
  Edit,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

export const highPriorityNames = [
  "feeds",
  "webhooks",
  "backups",
  "assets",
  "broken-links",
  "rules",
  "ai-prompts",
  "import-sessions",
  "import-detail",
  "import-results",
  "highlights",
  "highlight-cards",
] as const;
export type HighPriorityName = (typeof highPriorityNames)[number];
const date = new Date("2000-01-01T00:00:00Z");
const noAction = () => undefined;
const rows = [0, 1, 2];
export const session: ZImportSessionWithStats = {
  id: "fixture-session",
  userId: "fixture-user",
  name: "Reading collection",
  status: "completed",
  createdAt: date,
  modifiedAt: date,
  rootListId: "fixture-list",
  message: null,
  totalBookmarks: 120,
  completedBookmarks: 110,
  failedBookmarks: 10,
  pendingBookmarks: 0,
  processingBookmarks: 0,
};
export const highlightFixtures: ZHighlight[] = rows.map((i) => ({
  id: `fixture-highlight-${i}`,
  userId: "fixture-user",
  bookmarkId: `fixture-bookmark-${i}`,
  createdAt: date,
  startOffset: 0,
  endOffset: 100,
  transcriptRevision: null,
  contextBefore: null,
  contextAfter: null,
  color: "yellow",
  text: [
    "Design is how something works, and the care that makes it easy to use.",
    "A useful collection makes it easy to find what matters when you need it.",
    "Small improvements to everyday tools add up over time.",
  ][i],
  note: i === 1 ? "Keep this for the next project." : null,
}));
export const resultItems = rows.map((i) => ({
  id: `fixture-result-${i}`,
  title: ["Design notes", "Research library", "Reading list"][i],
  url: `https://example.com/article-${i}`,
  content: null,
  type: "link",
  status: "completed",
  result: "accepted",
  resultReason: "Saved to your library",
  resultBookmarkId: `fixture-bookmark-${i}`,
}));

function IconButtons({
  icons,
  editing = false,
  regular = false,
}: {
  icons: (typeof Edit)[];
  editing?: boolean;
  regular?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      {icons.map((Icon, i) =>
        editing ? (
          <EditingButton
            key={i}
            tooltip={t(
              i === icons.length - 1 ? "actions.delete" : "actions.edit",
            )}
            variant={i === icons.length - 1 ? "ghostDestructive" : "ghost"}
          >
            <Icon className="size-4" />
          </EditingButton>
        ) : (
          <Button
            key={i}
            variant={i === icons.length - 1 ? "ghostDestructive" : "ghost"}
            size={regular ? "default" : "icon"}
            className={!regular && i === 0 ? "rounded-full" : undefined}
          >
            <Icon className="size-4" />
          </Button>
        ),
      )}
    </div>
  );
}
function SessionActions() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <Button variant="outline" size="sm">
        <ExternalLink className="mr-1 size-4" />
        {t("settings.import_sessions.view_details")}
      </Button>
      <Button variant="destructiveOutline" size="sm">
        <Trash2 className="mr-1 size-4" />
        {t("actions.delete")}
      </Button>
    </div>
  );
}
function HighlightFixture({ highlight }: { highlight: ZHighlight }) {
  return (
    <HighlightCardContent
      highlight={highlight}
      clickable={false}
      onBookmarkClick={noAction}
      actions={
        <EditingButton tooltip="Delete" variant="ghost">
          <Trash2 className="size-4 text-destructive" />
        </EditingButton>
      }
    />
  );
}

/** Synthetic values and inert controls only; never mount the live controllers. */
export function HighPriorityFixture({ name }: { name: HighPriorityName }) {
  const { t } = useTranslation();
  switch (name) {
    case "feeds":
      return (
        <FeedsTable>
          {rows.map((i) => (
            <FeedRowContent
              key={i}
              feed={{
                id: `fixture-feed-${i}`,
                name: [
                  "Design journal",
                  "Reading notes",
                  "Engineering updates",
                ][i],
                url: `https://example.com/feed-${i}.xml`,
                enabled: true,
                importTags: false,
                lastFetchedStatus: "success",
                lastFetchedAt: date,
                lastSuccessfulFetchAt: date,
              }}
              actions={
                <div className="flex items-center gap-2">
                  <Switch checked />
                  <IconButtons
                    icons={[Edit, ArrowDownToLine, Trash2]}
                    regular
                  />
                </div>
              }
            />
          ))}
        </FeedsTable>
      );
    case "webhooks":
      return (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
          <WebhooksTable>
            {rows.map((i) => (
              <WebhookRowContent
                key={i}
                webhook={{
                  id: `fixture-webhook-${i}`,
                  url: `https://example.com/events-${i}`,
                  events: ["created", "edited"],
                  hasToken: true,
                  createdAt: date,
                }}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 size-4" />
                      {t("actions.edit")}
                    </Button>
                    <Button variant="outline" size="sm">
                      <KeyRound className="mr-2 size-4" />
                      {t("settings.webhooks.edit_auth_token")}
                    </Button>
                    <Button variant="destructiveOutline" size="sm">
                      <Trash2 className="mr-2 size-4" />
                      {t("actions.delete")}
                    </Button>
                  </div>
                }
              />
            ))}
          </WebhooksTable>
        </div>
      );
    case "backups":
      return (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-background/80">
          <BackupsTable>
            {rows.map((i) => (
              <BackupRowContent
                key={i}
                backup={{
                  id: `fixture-backup-${i}`,
                  userId: "fixture-user",
                  assetId: "fixture-archive",
                  createdAt: date,
                  size: 12345678,
                  bookmarkCount: 1234,
                  status: "success",
                }}
                actions={<IconButtons icons={[Download, Trash2]} />}
              />
            ))}
          </BackupsTable>
        </div>
      );
    case "assets":
      return (
        <AssetsSettingsContent
          assets={rows.map((i) => ({
            id: `fixture-asset-${i}`,
            assetType: "pdf",
            size: 1234567,
            contentType: "application/pdf",
            fileName: "Reading.pdf",
            bookmarkId: `fixture-bookmark-${i}`,
          }))}
          renderActions={() => (
            <Button variant="destructive" size="icon-sm">
              <Trash2 className="size-4" />
            </Button>
          )}
        />
      );
    case "broken-links":
      return (
        <BrokenLinksSettingsContent
          visibleBookmarks={rows.map((i) => ({
            id: `fixture-broken-${i}`,
            url: `https://example.com/article-${i}`,
            statusCode: 404,
            isCrawlingFailure: false,
            crawledAt: date,
            createdAt: date,
          }))}
          renderActions={() => (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="h-8 gap-2">
                <RefreshCw className="size-4" />
                {t("actions.recrawl")}
              </Button>
              <Button variant="ghostDestructive" size="icon-sm">
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        />
      );
    case "rules":
      return (
        <RuleListContent
          rules={rows.map((i) => ({
            id: `fixture-rule-${i}`,
            name: [
              "Organize new bookmarks",
              "Keep reference material",
              "Archive finished reading",
            ][i],
            description:
              "Apply this rule when a bookmark is added to your library.",
            enabled: true,
            event: { type: "bookmarkAdded" },
            condition: { type: "alwaysTrue" },
            actions: [{ type: "archiveBookmark" }],
          }))}
          renderActions={() => (
            <div className="flex items-center space-x-2">
              <Switch checked />
              <IconButtons icons={[Edit, Trash2]} editing />
            </div>
          )}
        />
      );
    case "ai-prompts":
      return (
        <div className="flex flex-col gap-2">
          {rows.map((i) => (
            <PromptRowLayout key={i}>
              <div className="flex-1 space-y-2">
                <Input
                  value={
                    [
                      "Suggest concise topic tags",
                      "Use specific descriptive labels",
                      "Summarize the main ideas",
                    ][i]
                  }
                  readOnly
                />
              </div>
              <div className="flex-0 space-y-2">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.ai.all_tagging")} />
                  </SelectTrigger>
                </Select>
              </div>
              <Button variant="secondary">
                <Save className="mr-2 size-4" />
                {t("actions.save")}
              </Button>
              <Button variant="destructive">
                <Trash2 className="mr-2 size-4" />
                {t("actions.delete")}
              </Button>
            </PromptRowLayout>
          ))}
        </div>
      );
    case "import-sessions":
      return (
        <div className="space-y-3">
          {rows.slice(0, 2).map((i) => (
            <ImportSessionCardContent
              key={i}
              session={{ ...session, id: `fixture-session-${i}` }}
              stats={session}
              createdAtLabel="Created 2 days ago"
              actions={<SessionActions />}
            />
          ))}
        </div>
      );
    case "import-detail":
      return (
        <ImportSessionDetailContent
          stats={session}
          filter="all"
          setFilter={noAction}
          actions={
            <Button variant="destructiveOutline" size="sm">
              <Trash2 className="mr-1 size-4" />
              {t("actions.delete")}
            </Button>
          }
          createdDescription="Created 2 days ago"
          results={<ImportResultsTable items={resultItems} />}
        />
      );
    case "import-results":
      return <ImportResultsTable items={resultItems} />;
    case "highlights":
      return (
        <div className="flex flex-col gap-2">
          {highlightFixtures.map((h) => (
            <Fragment key={h.id}>
              <HighlightRowContent
                highlight={h}
                fromNow="2 days ago"
                localCreatedAt="January 1, 2000"
                card={<HighlightFixture highlight={h} />}
              />
              <Separator className="m-2 last:hidden" />
            </Fragment>
          ))}
        </div>
      );
    case "highlight-cards":
      return (
        <div className="space-y-4">
          {highlightFixtures.map((h) => (
            <HighlightFixture key={h.id} highlight={h} />
          ))}
        </div>
      );
  }
}
