"use client";

import type { ReactNode } from "react";
import type { ResponsiveBones } from "boneyard-js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalizeBone } from "boneyard-js";
import { Skeleton as BoneyardSkeleton } from "boneyard-js/react";
import { useTranslation } from "@/lib/i18n/client";
import { Skeleton } from "@/components/ui/skeleton";
import { selectSurfaceCapture } from "./surfaceGeometry";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Generated content geometry, with a useful first paint before hydration. */
export function CapturedSkeleton({
  name,
  bones,
  className,
  fallback,
}: {
  name: string;
  bones: ResponsiveBones;
  className?: string;
  fallback?: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const viewport = useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 0,
  );
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const capture = selectSurfaceCapture(bones, width, viewport);
  return (
    <div
      ref={ref}
      className={className}
      role="status"
      aria-label={t("common.loading")}
      aria-busy="true"
      data-content-skeleton={name}
    >
      <div
        aria-hidden="true"
        style={{ height: capture?.height }}
        className="relative overflow-hidden"
      >
        {capture?.bones
          .map(normalizeBone)
          .filter((bone) => bone.c)
          .map((bone, index) => (
            <div
              key={index}
              className="pointer-events-none absolute border border-border/70 bg-card/90"
              style={{
                left: `${bone.x}%`,
                top: bone.y,
                width: `${bone.w}%`,
                height: bone.h,
                borderRadius: bone.r,
              }}
            />
          ))}
        <BoneyardSkeleton
          key={`${viewport < 640}:${capture?.width}:${capture?.height}`}
          name={name}
          loading
          initialBones={capture}
          color="var(--muted)"
          darkColor="var(--muted)"
          animate="solid"
          boneClass="animate-pulse"
          className="h-full"
          fallback={
            fallback ?? (
              <div className="space-y-4 py-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              </div>
            )
          }
        >
          {null}
        </BoneyardSkeleton>
      </div>
    </div>
  );
}
