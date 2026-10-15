"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogTrigger,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n/client";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folders,
} from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

import ListTreePicker from "./ListTreePicker";

export function SublistNavigation({ lists }: { lists: ZBookmarkList[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (lists.length === 0) return null;

  const visibleLists = expanded ? lists : lists.slice(0, 3);
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-1.5">
      <h2 id={`${id}-heading`} className="text-xs font-medium">
        {t("lists.navigation.sublists")}{" "}
        <span className="ms-2 tabular-nums text-muted-foreground">
          {lists.length}
        </span>
      </h2>
      <ul id={`${id}-children`}>
        {visibleLists.map((list) => (
          <SidebarItem
            key={list.id}
            name={list.name}
            path={`/dashboard/lists/${list.id}`}
            logo={
              <span className="text-lg" aria-hidden>
                {list.icon}
              </span>
            }
            linkClassName="px-1.5 py-1.5"
            right={
              <ChevronRight
                className="me-1.5 size-3.5 shrink-0 text-muted-foreground rtl:rotate-180"
                aria-hidden
              />
            }
          />
        ))}
        {lists.length > 3 && (
          <li className="flex justify-center pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={`${id}-children`}
              onClick={() => setExpanded(!expanded)}
              className="relative h-6 max-w-full gap-1 px-2 py-0 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground active:scale-100"
            >
              {expanded ? (
                <ChevronUp className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
              {expanded
                ? t("lists.navigation.show_fewer")
                : t("lists.navigation.show_more", { count: lists.length - 3 })}
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

export function ListSwitcher() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-8 shrink-0 gap-1.5 px-2 text-xs focus-visible:ring-foreground active:scale-100 sm:h-9 sm:px-2.5 sm:text-sm"
    >
      {t("lists.navigation.switch_list")}
      <ChevronDown className="size-4" aria-hidden />
    </Button>
  );
  const content = (
    <>
      <div className="min-h-0 min-w-0">
        <ListTreePicker showHeader={false} onNavigate={() => setOpen(false)} />
      </div>
      <Button
        asChild
        variant="outline"
        className="h-11 w-full justify-between gap-3 rounded-lg bg-background px-3 focus-visible:ring-foreground active:scale-100"
      >
        <Link href="/dashboard/lists" onNavigate={() => setOpen(false)}>
          <span className="flex min-w-0 items-center gap-2">
            <Folders className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("lists.all_lists")}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        </Link>
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <ResponsiveDialogContent
          className="bg-sidebar h-[min(36rem,80dvh,var(--vvh))] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overscroll-contain"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="pe-8 leading-snug"
          >
            {t("lists.navigation.switch_list")}
          </DialogTitle>
          {content}
        </ResponsiveDialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t("lists.navigation.switch_list")}
        className="bg-sidebar grid h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-2 overscroll-contain p-3"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
