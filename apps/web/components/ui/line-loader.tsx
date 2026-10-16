"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export default function LineLoader({
  pending = true,
  className,
}: {
  pending?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const settling = useRef<Animation | null>(null);

  useEffect(() => {
    settling.current?.cancel();
    const element = ref.current;
    if (
      !pending ||
      !element?.animate ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return () => settling.current?.cancel();
    }

    // CSS starts the animation in the initial HTML. After hydration, use the
    // Web Animations API so navigation can settle smoothly when loading ends.
    element.style.animation = "none";
    const loading = element.animate(
      [
        { left: "0px", right: "0px" },
        { left: "0px", right: "75%" },
        { left: "0px", right: "0px" },
        { left: "75%", right: "0px" },
        { left: "0px", right: "0px" },
      ],
      {
        duration: 600,
        delay: 200,
        iterations: Infinity,
        easing: "ease-in-out",
      },
    );

    return () => {
      // Capture the moving endpoints before cancelling so completion grows
      // smoothly from the current shape to the full-width resting line.
      const { left, right } = getComputedStyle(element);
      const started =
        typeof loading.currentTime === "number" && loading.currentTime >= 200;
      loading.cancel();
      if (element.isConnected && started) {
        settling.current = element.animate(
          [
            { left, right },
            { left: "0px", right: "0px" },
          ],
          { duration: 180, easing: "ease-out" },
        );
      }
    };
  }, [pending]);

  return (
    <>
      <style>{`
        .marka-line-loader[data-pending="true"] { animation: marka-line-loading .6s ease-in-out .2s infinite; }
        @keyframes marka-line-loading {
          0%, 50%, 100% { left: 0; right: 0; }
          25% { left: 0; right: 75%; }
          75% { left: 75%; right: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .marka-line-loader[data-pending="true"] { animation: none; }
        }
      `}</style>
      <span
        ref={ref}
        aria-hidden="true"
        data-pending={pending}
        className={cn(
          "marka-line-loader absolute inset-x-0 h-0.5 rounded-full bg-current",
          className,
        )}
      />
    </>
  );
}
