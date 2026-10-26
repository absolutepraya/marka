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

const captures = {
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
};

const titles: Record<SurfaceName, string> = {
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
            name === "subscription-price"
              ? "w-24"
              : name.startsWith("admin-") || name === "lists" || name === "tags"
                ? "mx-auto w-full max-w-7xl"
                : "mx-auto w-full max-w-4xl"
          }
        >
          {!capture && (
            <h2 className="mb-4 break-words text-lg font-semibold">
              {titles[name]}
            </h2>
          )}
          <div className={name === "subscription" ? "p-5" : undefined}>
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
