"use client";

import React, { createContext, useContext, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

const TabNavigationContext = createContext<(() => void) | undefined>(undefined);

export function useSaveTabPosition() {
  return useContext(TabNavigationContext);
}

export default function MobileTabNavigation({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const positions = useRef(new Map<string, number>());
  const api = useTRPC();
  const queryClient = useQueryClient();
  const sortOrder = useSortOrderStore((state) => state.sortOrder);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType?.includes("2g"))
      return;

    // Route prefetch handles server-rendered tabs. These client queries need
    // warming separately, using the same keys as the destination screens.
    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return;
      for (const archived of [false, true]) {
        void queryClient.prefetchInfiniteQuery(
          api.bookmarks.getBookmarks.infiniteQueryOptions(
            {
              archived,
              sortOrder: sortOrder === "relevance" ? "desc" : sortOrder,
              includeContent: false,
              useCursorV2: true,
            },
            {
              initialCursor: null,
              getNextPageParam: (page) => page.nextCursor,
            },
          ),
        );
      }
      for (const attachedBy of ["human", "ai", "none"] as const) {
        void queryClient.prefetchInfiniteQuery(
          api.tags.list.infiniteQueryOptions(
            { nameContains: "", sortBy: "usage", attachedBy, limit: 50 },
            { getNextPageParam: (page) => page.nextCursor },
          ),
        );
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [api, queryClient, sortOrder]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    if (
      ![
        "/dashboard/bookmarks",
        "/dashboard/archive",
        "/dashboard/tags",
        "/dashboard/highlights",
        "/dashboard/lists",
      ].includes(pathname)
    )
      return;
    const top = positions.current.get(pathname) ?? 0;
    let frame = 0;
    // Cached queries render synchronously; a cold screen may grow after its
    // request finishes. Retry restoration as its content becomes available.
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        window.scrollTo({ top, behavior: "instant" }),
      );
    };
    const observer = new ResizeObserver(restore);
    const main = document.querySelector("main");
    if (main) observer.observe(main);
    restore();
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    const timer = window.setTimeout(stop, 1000);
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
    return () => {
      stop();
      window.clearTimeout(timer);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
    };
  }, [pathname]);

  return (
    <TabNavigationContext.Provider
      value={() => positions.current.set(pathname, window.scrollY)}
    >
      {children}
    </TabNavigationContext.Provider>
  );
}
