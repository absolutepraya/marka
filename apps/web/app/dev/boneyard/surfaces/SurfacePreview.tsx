"use client";

import { Skeleton as Capture } from "boneyard-js/react";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import adminUsers from "@/components/loading-ui/bones/admin-users.bones.json";
import adminInvites from "@/components/loading-ui/bones/admin-invites.bones.json";
import adminConnections from "@/components/loading-ui/bones/admin-connections.bones.json";
import adminJobs from "@/components/loading-ui/bones/admin-jobs.bones.json";
import usageStats from "@/components/loading-ui/bones/usage-stats.bones.json";
import subscription from "@/components/loading-ui/bones/subscription.bones.json";
import subscriptionPrice from "@/components/loading-ui/bones/subscription-price.bones.json";
import quota from "@/components/loading-ui/bones/quota.bones.json";
import lists from "@/components/loading-ui/bones/lists.bones.json";
import tags from "@/components/loading-ui/bones/tags.bones.json";
import bookmarkTags from "@/components/loading-ui/bones/bookmark-tags.bones.json";
import type { SurfaceName } from "./SurfaceFixtures";
import { SurfaceFixture, surfaceNames } from "./SurfaceFixtures";

import high0 from "@/components/loading-ui/bones/feeds.bones.json";
import high1 from "@/components/loading-ui/bones/webhooks.bones.json";
import high2 from "@/components/loading-ui/bones/backups.bones.json";
import high3 from "@/components/loading-ui/bones/assets.bones.json";
import high4 from "@/components/loading-ui/bones/broken-links.bones.json";
import high5 from "@/components/loading-ui/bones/rules.bones.json";
import high6 from "@/components/loading-ui/bones/ai-prompts.bones.json";
import high7 from "@/components/loading-ui/bones/import-sessions.bones.json";
import high8 from "@/components/loading-ui/bones/import-detail.bones.json";
import high9 from "@/components/loading-ui/bones/import-results.bones.json";
import high10 from "@/components/loading-ui/bones/highlights.bones.json";
import high11 from "@/components/loading-ui/bones/highlight-cards.bones.json";

import manageLists from "@/components/loading-ui/bones/manage-lists.bones.json";
import collaborators from "@/components/loading-ui/bones/collaborators.bones.json";
import contentEditors from "@/components/loading-ui/bones/content-editors.bones.json";

const captures = {
  "manage-lists": manageLists,
  collaborators,
  "content-editors": contentEditors,
  "admin-users": adminUsers,
  "admin-invites": adminInvites,
  "admin-connections": adminConnections,
  "admin-jobs": adminJobs,
  "usage-stats": usageStats,
  subscription,
  "subscription-price": subscriptionPrice,
  quota,
  lists,
  tags,
  "bookmark-tags": bookmarkTags,
  feeds: high0,
  webhooks: high1,
  backups: high2,
  assets: high3,
  "broken-links": high4,
  rules: high5,
  "ai-prompts": high6,
  "import-sessions": high7,
  "import-detail": high8,
  "import-results": high9,
  highlights: high10,
  "highlight-cards": high11,
};

const titles: Record<SurfaceName, string> = {
  "manage-lists": "Manage lists",
  collaborators: "List collaborators",
  "content-editors": "Content editors",
  "admin-users": "Users",
  "admin-invites": "Invitations",
  "admin-connections": "Service connections",
  "admin-jobs": "Background jobs",
  "usage-stats": "Usage statistics",
  subscription: "Subscription",
  "subscription-price": "Price",
  quota: "Usage quotas",
  lists: "Lists",
  tags: "Tags",
  "bookmark-tags": "Bookmark tags",
  feeds: "Feeds",
  webhooks: "Webhooks",
  backups: "Backups",
  assets: "Assets",
  "broken-links": "Broken Links",
  rules: "Rules",
  "ai-prompts": "Ai Prompts",
  "import-sessions": "Import Sessions",
  "import-detail": "Import Detail",
  "import-results": "Import Results",
  highlights: "Highlights",
  "highlight-cards": "Highlight Cards",
};

export default function SurfacePreview({
  capture,
  state,
  surface,
}: {
  capture: boolean;
  state?: string;
  surface?: string;
}) {
  const names = surfaceNames.includes(surface as SurfaceName)
    ? [surface as SurfaceName]
    : surfaceNames;
  return (
    <div className="space-y-8">
      {names.map((name) => (
        <section
          key={name}
          data-preview-surface={name}
          className={
            name === "manage-lists"
              ? `mx-auto w-[100vw] max-sm:-ml-4 sm:max-w-md ${capture ? "sm:w-[calc(100vw-2rem)]" : "sm:w-full"}`
              : name === "collaborators"
                ? `mx-auto w-[100vw] max-sm:-ml-4 sm:max-w-2xl ${capture ? "sm:w-[calc(100vw-2rem)]" : "sm:w-full"}`
                : name === "content-editors"
                  ? `mx-auto w-[100vw] max-sm:-ml-4 sm:max-w-xl ${capture ? "sm:w-[calc(100vw-2rem)]" : "sm:w-full"}`
                  : name === "subscription-price"
                    ? "w-24"
                    : name === "highlight-cards"
                      ? "mx-auto w-full sm:w-72"
                      : name.startsWith("admin-") ||
                          name === "lists" ||
                          name === "tags" ||
                          name === "highlights"
                        ? "mx-auto w-full max-w-7xl"
                        : "mx-auto w-full max-w-4xl"
          }
        >
          {!capture && (
            <h2 className="mb-4 break-words text-lg font-semibold">
              {titles[name]}
            </h2>
          )}
          <div
            className={
              name === "manage-lists"
                ? "border-transparent bg-card sm:border"
                : name === "collaborators" || name === "content-editors"
                  ? "border-transparent bg-card p-5 sm:border sm:p-6"
                  : name === "subscription"
                    ? "p-5"
                    : name === "highlights"
                      ? "rounded-xl border bg-card p-4 sm:p-5"
                      : [
                            "feeds",
                            "webhooks",
                            "backups",
                            "rules",
                            "ai-prompts",
                            "import-sessions",
                            "import-results",
                          ].includes(name)
                        ? "border border-transparent px-5 py-4"
                        : undefined
            }
          >
            {capture ? (
              <div inert>
                <Capture
                  name={name}
                  loading={false}
                  snapshotConfig={{ leafTags: ["div"] }}
                >
                  <SurfaceFixture name={name} />
                </Capture>
              </div>
            ) : state === "loaded" ? (
              <div inert>
                <SurfaceFixture name={name} />
              </div>
            ) : (
              <CapturedSkeleton name={name} bones={captures[name]} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
