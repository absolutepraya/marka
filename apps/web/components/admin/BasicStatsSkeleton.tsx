"use client";

import { useSyncExternalStore } from "react";
import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/client";

import bones from "./bones/admin-stats.bones.json";
import { BasicStatsFixture } from "./BasicStatsContent";

const captures: Record<string, { height: number }> = bones.breakpoints;
const captureWidths = Object.keys(captures)
  .map(Number)
  .sort((a, b) => b - a);

function subscribeToViewport(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getCaptureWidth() {
  return (
    captureWidths.find((width) => window.innerWidth >= width) ??
    captureWidths[captureWidths.length - 1]
  );
}

function getServerCaptureWidth() {
  return 0;
}

function StatsFallback() {
  return (
    <>
      <div className="mb-4 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full max-w-72" />
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
    </>
  );
}

export default function BasicStatsSkeleton() {
  const { t } = useTranslation();
  const captureWidth = useSyncExternalStore(
    subscribeToViewport,
    getCaptureWidth,
    getServerCaptureWidth,
  );

  return (
    <div role="status" aria-label={t("common.loading")}>
      <div
        aria-hidden="true"
        style={{ height: captures[captureWidth]?.height }}
      >
        <BoneyardSkeleton
          // Boneyard retains its measured height across captures. Remount when
          // the capture changes so a desktop height cannot squash mobile bones.
          key={captureWidth}
          className="h-full"
          name="admin-stats"
          loading
          initialBones={bones}
          select="viewport"
          color="var(--muted)"
          darkColor="var(--muted)"
          animate="solid"
          boneClass="animate-pulse"
          fixture={<BasicStatsFixture />}
          fallback={<StatsFallback />}
        >
          {null}
        </BoneyardSkeleton>
      </div>
    </div>
  );
}
