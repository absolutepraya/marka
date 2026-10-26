"use client";

import {
  navigationItemActive,
  navigationItemIdle,
} from "@karakeep/shared-react/components/ui/control-styles";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { EditingButton } from "@/components/ui/editing-button";
import { CollapsibleTriggerChevron } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  MoreHorizontal,
  Plus,
  Search,
  SearchX,
  X,
} from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  augmentBookmarkListsWithInitialData,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

import { CollapsibleBookmarkLists } from "./CollapsibleBookmarkLists";
import { EditListModal } from "./EditListModal";
import { ListOptions } from "./ListOptions";

// A single compact tree row: chevron, emoji tile, name, item count, and an
// options menu that fades in on hover. Indentation tracks the nesting level,
// mirroring the sidebar tree but with a touch more room for a full page.
export function ListRow({
  name,
  icon,
  path,
  level = 0,
  list,
  open,
  collapsible,
  itemCount,
}: {
  name: string;
  icon: string;
  path: string;
  level?: number;
  list?: ZBookmarkList;
  open?: boolean;
  collapsible: boolean;
  itemCount?: number;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const isActive = path === pathname;
  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <div
      className={cn(
        "group/list-row relative flex items-center justify-between gap-2 overflow-hidden rounded-lg px-2 py-1 transition-[background-color,color,box-shadow,ring-color] duration-150",
        isActive ? navigationItemActive : navigationItemIdle,
      )}
      style={{ marginLeft: `${level * 1.25}rem` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {collapsible ? (
          <CollapsibleTriggerChevron className="size-4" open={open ?? false} />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Link
          href={path}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5"
        >
          <span className="shrink-0 text-lg leading-none">{icon}</span>
          <span className="truncate text-sm text-foreground">{name}</span>
        </Link>
      </div>
      {/* Count sits at the far right in every row; for editable lists the
          options button is absolutely positioned so it doesn't shift the count
          (keeping All Lists counts aligned with the Pinned ones), fading in
          over the count on hover. Touch devices never hover, so on coarse
          pointers the button sits in-flow next to the count instead. */}
      <div className="relative flex shrink-0 items-center text-muted-foreground">
        {itemCount !== undefined && itemCount > 0 && (
          <span
            className={cn(
              "px-1 text-xs tabular-nums",
              list &&
                "pointer-fine:group-hover/list-row:opacity-0 pointer-fine:group-focus-within/list-row:opacity-0 transition-opacity",
              optionsOpen && "pointer-fine:opacity-0",
            )}
          >
            {itemCount.toLocaleString()}
          </span>
        )}
        {list && (
          <ListOptions
            list={list}
            isOpen={optionsOpen}
            onOpenChange={setOptionsOpen}
          >
            <Button
              size="none"
              variant="ghost"
              aria-label={t("lists.navigation.list_options", {
                name: list.name,
              })}
              className="pointer-coarse:static pointer-coarse:opacity-100 absolute inset-y-0 right-0 my-auto flex size-7 items-center justify-center rounded-lg bg-transparent opacity-0 hover:bg-transparent focus-visible:opacity-100 focus-visible:ring-inset group-focus-within/list-row:opacity-100 group-hover/list-row:opacity-100 data-[state=open]:bg-transparent data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </ListOptions>
        )}
      </div>
    </div>
  );
}

export function ListSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-xl border bg-card p-1.5">{children}</div>
    </section>
  );
}

export default function AllListsView({
  initialData,
  favoritesCount,
  archivedCount,
}: {
  initialData: ZBookmarkList[];
  favoritesCount?: number;
  archivedCount?: number;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  // Fetch live lists data
  const { data: listsData } = useBookmarkLists(undefined, {
    initialData: { lists: initialData },
  });
  const lists = augmentBookmarkListsWithInitialData(listsData, initialData);

  // Client-side search: all lists are in memory. Results start at each matched
  // folder (the top-most match) with its subtree, mirroring the sidebar.
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;
  const matchedRoots = useMemo(() => {
    if (!isSearching) return [];
    const roots: ZBookmarkListTreeNode[] = [];
    const walk = (node: ZBookmarkListTreeNode, ancestorMatched: boolean) => {
      const selfMatched = node.item.name.toLowerCase().includes(trimmedQuery);
      if (selfMatched && !ancestorMatched) {
        roots.push(node);
      }
      node.children.forEach((child) =>
        walk(child, ancestorMatched || selfMatched),
      );
    };
    Object.values(lists.root).forEach((node) => walk(node, false));
    return roots;
  }, [isSearching, trimmedQuery, lists.root]);

  const hasSharedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole !== "owner");
  }, [lists.data]);

  const hasOwnedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole === "owner");
  }, [lists.data]);

  const renderRow = ({
    node,
    level,
    open,
    numBookmarks,
  }: {
    node: ZBookmarkListTreeNode;
    level: number;
    open: boolean;
    numBookmarks?: number;
  }) => (
    <ListRow
      name={node.item.name}
      icon={node.item.icon}
      itemCount={numBookmarks}
      level={level}
      list={node.item}
      path={`/dashboard/lists/${node.item.id}`}
      collapsible={node.children.length > 0}
      open={open}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 pt-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("lists.search_placeholder", {
            defaultValue: "Search lists",
          })}
          aria-label={t("lists.search_placeholder", {
            defaultValue: "Search lists",
          })}
          startIcon={<Search className="size-4 text-muted-foreground" />}
          endIcon={
            // Always mounted so it fades/scales instead of popping in and out
            // on the first/last character typed.
            <button
              type="button"
              aria-label={t("actions.clear", { defaultValue: "Clear" })}
              onClick={() => setQuery("")}
              tabIndex={query ? 0 : -1}
              aria-hidden={query ? undefined : true}
              className={cn(
                "flex items-center text-muted-foreground transition-[opacity,scale,color] duration-150 ease-out hover:text-foreground",
                query
                  ? "scale-100 opacity-100"
                  : "pointer-events-none scale-90 opacity-0",
              )}
            >
              <X className="size-4" />
            </button>
          }
          className="shadow-xs h-11 rounded-lg focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:flex-1 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <EditListModal>
          <EditingButton tooltip={t("lists.new_list")} ignoreDemoMode>
            <Plus />
          </EditingButton>
        </EditListModal>
      </div>

      {isSearching ? (
        matchedRoots.length > 0 ? (
          <div className="rounded-xl border bg-card p-1.5">
            <CollapsibleBookmarkLists
              listsData={{
                ...lists,
                root: Object.fromEntries(
                  matchedRoots.map((node) => [node.item.id, node]),
                ),
              }}
              render={renderRow}
            />
          </div>
        ) : (
          <EmptyState
            compact={true}
            icon={<SearchX />}
            title={t("lists.no_lists_found", {
              defaultValue: "No lists found",
            })}
            description="Try a different name or clear the search to browse your full list tree."
          />
        )
      ) : (
        <>
          <ListSection title="Pinned">
            <ListRow
              collapsible={false}
              name={t("lists.favourites")}
              icon="⭐️"
              itemCount={favoritesCount}
              path={`/dashboard/favourites`}
            />
            <ListRow
              collapsible={false}
              name={t("common.archive")}
              icon="🗄️"
              itemCount={archivedCount}
              path={`/dashboard/archive`}
            />
          </ListSection>

          {hasOwnedLists ? (
            <ListSection title={t("lists.all_lists")}>
              <CollapsibleBookmarkLists
                listsData={lists}
                filter={(node) => node.item.userRole === "owner"}
                render={renderRow}
              />
            </ListSection>
          ) : (
            <ListSection title={t("lists.all_lists")}>
              <EmptyState
                compact={true}
                icon={<ClipboardList />}
                title={t("lists.no_lists_yet", {
                  defaultValue: "You don't have any lists yet.",
                })}
                description="Create your first list to group related bookmarks, projects, or shared reading."
                action={
                  <EditListModal>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Plus className="size-4" />
                      {t("lists.new_list")}
                    </Button>
                  </EditListModal>
                }
              />
            </ListSection>
          )}

          {hasSharedLists && (
            <ListSection title={t("lists.shared_lists")}>
              <CollapsibleBookmarkLists
                listsData={lists}
                filter={(node) => node.item.userRole !== "owner"}
                render={renderRow}
              />
            </ListSection>
          )}
        </>
      )}
    </div>
  );
}
