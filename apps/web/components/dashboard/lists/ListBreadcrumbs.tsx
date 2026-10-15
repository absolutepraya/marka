"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n/client";
import { ChevronRight, Ellipsis } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

const linkClassName =
  "inline-flex min-h-5 min-w-0 items-center gap-1 rounded px-1 py-0 text-xs hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export default function ListBreadcrumbs({ path }: { path: ZBookmarkList[] }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const hiddenPath = isMobile ? path.slice(0, -2) : [];
  const visiblePath = hiddenPath.length ? path.slice(-2) : path;

  return (
    <nav
      aria-label={t("lists.collaboration.breadcrumb_label")}
      className="min-w-0"
    >
      <ol className="flex min-w-0 flex-nowrap items-center gap-1 text-muted-foreground">
        <li className="flex min-w-0 max-w-[30%] shrink-0 items-center gap-1">
          <Link
            href="/dashboard/lists"
            className={linkClassName}
            title={t("lists.all_lists")}
          >
            <span className="truncate">{t("lists.all_lists")}</span>
          </Link>
          <ChevronRight
            className="size-3 shrink-0 rtl:rotate-180"
            aria-hidden
          />
        </li>
        {hiddenPath.length > 0 && (
          <li className="flex shrink-0 items-center gap-1">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label={t("lists.navigation.show_ancestors")}
                  className="h-5 focus-visible:ring-foreground active:scale-100"
                >
                  <Ellipsis className="size-4" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                aria-label={t("lists.navigation.show_ancestors")}
                className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain p-2"
              >
                <ul className="space-y-1">
                  {hiddenPath.map((list) => (
                    <li key={list.id}>
                      <Link
                        href={`/dashboard/lists/${list.id}`}
                        onNavigate={() => setOpen(false)}
                        className={`${linkClassName} w-full gap-2 px-2 hover:bg-accent`}
                      >
                        <span className="shrink-0" aria-hidden>
                          {list.icon}
                        </span>
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                          {list.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            <ChevronRight
              className="size-3 shrink-0 rtl:rotate-180"
              aria-hidden
            />
          </li>
        )}
        {visiblePath.map((list, index) => {
          const isCurrent = index === visiblePath.length - 1;
          return (
            <li
              key={list.id}
              className="flex min-w-0 max-w-full items-center gap-1"
            >
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="min-w-0 truncate px-1 py-0 text-xs text-foreground"
                  title={list.name}
                >
                  {list.name}
                </span>
              ) : (
                <Link
                  href={`/dashboard/lists/${list.id}`}
                  className={linkClassName}
                  title={list.name}
                >
                  <span className="min-w-0 truncate">{list.name}</span>
                </Link>
              )}
              {!isCurrent && (
                <ChevronRight
                  className="size-3 shrink-0 rtl:rotate-180"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
