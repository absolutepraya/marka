"use client";
import { dialogSurfaceNames, DialogFixture } from "./DialogFixtures";
import { highPriorityNames, HighPriorityFixture } from "./HighPriorityFixtures";

import { UsersContent } from "@/components/admin/UserList";
import { InvitesContent } from "@/components/admin/InvitesList";
import { ConnectionsContent } from "@/components/admin/ServiceConnections";
import { BackgroundJobsContent } from "@/components/admin/BackgroundJobs";
import { UsageStatsContent } from "@/components/settings/UsageStats";
import {
  SubscriptionDetails,
  SubscriptionPriceAmount,
} from "@/components/settings/SubscriptionSettings";
import { QuotaContent } from "@/components/subscription/QuotaProgress";
import {
  ListRow,
  ListSection,
} from "@/components/dashboard/lists/AllListsView";
import { TagPillContent } from "@/components/dashboard/tags/TagPill";
import { BookmarkTag } from "@/components/dashboard/bookmarks/TagList";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  KeyRound,
  Mail,
  MailX,
  Pencil,
  Plus,
  Search,
  Trash,
  UserPlus,
} from "lucide-react";

const users = ["Alex Morgan", "Jamie Rivera", "Robin Chen", "Sam Taylor"].map(
  (name, i) => ({
    id: `fixture-${i}`,
    name,
    email: `reader${i + 1}@example.com`,
    role: "user" as const,
    localUser: true,
    bookmarkQuota: 5000,
    storageQuota: 1073741824,
  }),
);
const userStats = Object.fromEntries(
  users.map((user) => [user.id, { numBookmarks: 123, assetSizes: 12345678 }]),
);
const invites = users.slice(0, 2).map((user) => ({
  id: user.id,
  email: user.email,
  createdAt: new Date("2000-01-01T00:00:00Z"),
  invitedBy: {
    id: "fixture-admin",
    name: "Alex Morgan",
    email: "admin@example.com",
  },
}));
const connection = { configured: true, connected: true };
const noAction = () => undefined;
const action = {
  label: "Reprocess bookmarks",
  onClick: async () => undefined,
  loading: false,
};
const queue = { queued: 12, pending: 24, failed: 0 };
const tagNames = [
  "Reading",
  "Design",
  "Development",
  "Research",
  "Ideas",
  "Reference",
  "Technology",
  "Articles",
  "Projects",
  "Inspiration",
  "Tools",
  "Learning",
  "Writing",
  "Work",
  "Personal",
];

export const surfaceNames = [
  "admin-users",
  "admin-invites",
  "admin-connections",
  "admin-jobs",
  "usage-stats",
  "subscription",
  "subscription-price",
  "quota",
  "lists",
  "tags",
  "bookmark-tags",
  ...highPriorityNames,
  ...dialogSurfaceNames,
] as const;
export type SurfaceName = (typeof surfaceNames)[number];

/** Only data-free presentation components, never live query/mutation controllers. */
export function SurfaceFixture({ name }: { name: SurfaceName }) {
  switch (name) {
    case "manage-lists":
    case "collaborators":
    case "content-editors":
      return <DialogFixture name={name} />;
    case "admin-users":
      return (
        <UsersContent
          users={users}
          userStats={userStats}
          createAction={
            <Button variant="outline">
              <UserPlus size={16} />
            </Button>
          }
          rowActions={() => (
            <div className="flex items-center gap-1.5">
              {[Trash, KeyRound, Pencil].map((Icon, i) => (
                <Button key={i} variant="outline">
                  <Icon size={16} />
                </Button>
              ))}
            </div>
          )}
        />
      );
    case "admin-invites":
      return (
        <InvitesContent
          activeInvites={invites}
          createAction={
            <Button variant="outline">
              <UserPlus size={16} />
            </Button>
          }
          formatCreatedAt={() => "2 days ago"}
          rowActions={() => (
            <div className="flex items-center gap-1.5">
              {[Mail, MailX].map((Icon, i) => (
                <Button key={i} variant="outline" size="sm">
                  <Icon size={14} />
                </Button>
              ))}
            </div>
          )}
        />
      );
    case "admin-connections":
      return (
        <ConnectionsContent
          connections={{
            searchEngine: { ...connection, pluginName: "Meilisearch" },
            browser: connection,
            queue: connection,
            vectorStore: connection,
          }}
        />
      );
    case "admin-jobs":
      return (
        <BackgroundJobsContent
          serverStats={{
            crawlStats: queue,
            inferenceStats: queue,
            indexingStats: queue,
            embeddingsStats: queue,
            assetPreprocessingStats: queue,
            adminMaintenanceStats: queue,
            videoStats: queue,
            webhookStats: queue,
            feedStats: queue,
          }}
          actions={{
            crawlActions: [action, action],
            inferenceActions: [action, action],
            indexingActions: [action],
            embeddingsActions: [action, action],
            assetPreprocessingActions: [action],
            adminMaintenanceActions: [action],
          }}
        />
      );
    case "usage-stats":
      return (
        <UsageStatsContent
          stats={{
            numBookmarks: 1234,
            numFavorites: 123,
            numArchived: 42,
            numTags: 48,
            numLists: 12,
            numHighlights: 56,
            bookmarksByType: { link: 1000, text: 200, asset: 34 },
            topDomains: [
              "reading.example",
              "design.example",
              "reference.example",
            ].map((domain, i) => ({ domain, count: 100 - i * 20 })),
            totalAssetSize: 123456789,
            assetsByType: [
              { type: "image", count: 42, totalSize: 100000000 },
              { type: "pdf", count: 12, totalSize: 23456789 },
            ],
            bookmarkingActivity: {
              thisWeek: 12,
              thisMonth: 48,
              thisYear: 450,
              byHour: Array.from({ length: 24 }, (_, hour) => ({
                hour,
                count: 4 + (hour % 8),
              })),
              byDayOfWeek: Array.from({ length: 7 }, (_, day) => ({
                day,
                count: 8 + day * 3,
              })),
            },
            tagUsage: tagNames
              .slice(0, 6)
              .map((name, i) => ({ name, count: 100 - i * 10 })),
            bookmarksBySource: [
              { source: "web", count: 800 },
              { source: "extension", count: 400 },
              { source: "mobile", count: 34 },
            ],
          }}
          userSettings={{ timezone: "UTC" }}
        />
      );
    case "subscription":
      return (
        <div className="space-y-3">
          <SubscriptionDetails
            subscriptionStatus={{
              tier: "free",
              status: null,
              startDate: null,
              endDate: null,
              hasActiveSubscription: false,
              cancelAtPeriodEnd: false,
            }}
            subscriptionPrice={{
              monthly: {
                priceId: "fixture-monthly",
                currency: "usd",
                amount: 500,
              },
              yearly: null,
            }}
            isLoading={false}
            onCheckout={noAction}
            onPortal={noAction}
          />
        </div>
      );
    case "subscription-price":
      return <SubscriptionPriceAmount amount={500} currency="usd" />;
    case "quota":
      return (
        <QuotaContent
          quotaUsage={{
            bookmarks: { used: 1234, quota: 5000, unlimited: false },
            storage: { used: 12345678, quota: 1073741824, unlimited: false },
          }}
        />
      );
    case "lists":
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 pt-2">
            <Input
              type="search"
              placeholder="Search lists"
              startIcon={<Search className="size-4" />}
              className="h-11"
            />
            <Button variant="outline">
              <Plus />
            </Button>
          </div>
          <ListSection title="Pinned">
            <ListRow
              name="Favourites"
              icon="⭐️"
              path="#"
              collapsible={false}
              itemCount={123}
            />
            <ListRow
              name="Archive"
              icon="🗄️"
              path="#"
              collapsible={false}
              itemCount={42}
            />
          </ListSection>
          <ListSection title="All lists">
            {["Reading", "Design references", "Projects", "Research"].map(
              (name, i) => (
                <Collapsible key={name} open={false}>
                  <ListRow
                    name={name}
                    icon="📚"
                    path="#"
                    collapsible={i === 0}
                    open={false}
                    itemCount={24}
                  />
                </Collapsible>
              ),
            )}
          </ListSection>
        </div>
      );
    case "tags":
      return (
        <div className="flex flex-wrap gap-2">
          {tagNames.map((name, i) => (
            <TagPillContent
              key={name}
              id={`fixture-${i}`}
              name={name}
              count={24 + i}
            />
          ))}
        </div>
      );
    case "bookmark-tags":
      return (
        <div className="flex flex-wrap gap-2 p-2">
          {tagNames.slice(0, 3).map((name, i) => (
            <BookmarkTag
              key={name}
              id={`fixture-${i}`}
              name={name}
              isOwner={false}
            />
          ))}
        </div>
      );
    default:
      return <HighPriorityFixture name={name} />;
  }
}
