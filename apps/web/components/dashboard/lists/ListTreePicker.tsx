"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SidebarItem from "@/components/shared/sidebar/SidebarItem";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTriggerChevron,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { searchFieldSurfaceClassName } from "@/components/ui/search-field";
import { useBookmarkDropTarget } from "@/lib/hooks/useBookmarkDropTarget";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Search, X } from "lucide-react";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  augmentBookmarkListsWithInitialData,
  useBookmarkLists,
} from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

import { CollapsibleBookmarkLists } from "./CollapsibleBookmarkLists";
import { EditListModal } from "./EditListModal";
import { ListOptions } from "./ListOptions";
import { InvitationNotificationBadge } from "../sidebar/InvitationNotificationBadge";

function DroppableListSidebarItem({
  node,
  level,
  open,
  numBookmarks,
  parentPath,
  selectedListId,
  setSelectedListId,
  onNavigate,
}: {
  node: ZBookmarkListTreeNode;
  level: number;
  open: boolean;
  numBookmarks?: number;
  parentPath?: string;
  selectedListId: string | null;
  setSelectedListId: (id: string | null) => void;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const canDrop =
    node.item.type === "manual" &&
    (node.item.userRole === "owner" || node.item.userRole === "editor");
  const showBookmarkCount = numBookmarks !== undefined && numBookmarks > 0;
  const { dropHighlight, onDragOver, onDragEnter, onDragLeave, onDrop } =
    useBookmarkDropTarget(node.item.id, node.item.name);

  return (
    <SidebarItem
      as="div"
      collapseButton={
        node.children.length > 0 ? (
          <CollapsibleTriggerChevron
            triggerClassName="m-0"
            className="size-4"
            open={open}
            label={t("lists.navigation.toggle_list", { name: node.item.name })}
          />
        ) : (
          <span className="size-6" />
        )
      }
      logo={
        <span className="flex">
          <span className="text-lg"> {node.item.icon}</span>
        </span>
      }
      name={node.item.name}
      description={parentPath}
      path={`/dashboard/lists/${node.item.id}`}
      onNavigate={onNavigate}
      className="group"
      right={
        <ListOptions
          onOpenChange={(isOpen) => {
            if (isOpen) {
              setSelectedListId(node.item.id);
            } else {
              setSelectedListId(null);
            }
          }}
          list={node.item}
        >
          <Button
            size="none"
            variant="ghost"
            aria-label={t("lists.navigation.list_options", {
              name: node.item.name,
            })}
            className="relative h-8 min-w-8 shrink-0 rounded-none rounded-r-lg bg-transparent px-1.5 hover:bg-transparent focus-visible:ring-inset data-[state=open]:bg-transparent"
          >
            <MoreHorizontal
              className={cn(
                "pointer-coarse:opacity-100 absolute inset-0 m-auto size-4 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100",
                selectedListId == node.item.id ? "opacity-100" : "opacity-0",
              )}
            />
            {showBookmarkCount && (
              <span
                className={cn(
                  "pointer-coarse:opacity-0 px-1 text-xs tabular-nums text-muted-foreground opacity-100 transition-opacity duration-100 group-focus-within:opacity-0 group-hover:opacity-0",
                  selectedListId == node.item.id ? "opacity-0" : "opacity-100",
                )}
              >
                {numBookmarks}
              </span>
            )}
          </Button>
        </ListOptions>
      }
      linkClassName="px-1.5 py-1.5"
      style={{ marginLeft: `${level * 1}rem` }}
      dropHighlight={canDrop && dropHighlight}
      onDragOver={canDrop ? onDragOver : undefined}
      onDragEnter={canDrop ? onDragEnter : undefined}
      onDragLeave={canDrop ? onDragLeave : undefined}
      onDrop={canDrop ? onDrop : undefined}
    />
  );
}

export default function ListTreePicker({
  initialData,
  onNavigate,
  showHeader = true,
}: {
  initialData?: { lists: ZBookmarkList[] };
  onNavigate?: () => void;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const pathName = usePathname();
  const isNodeOpen = useCallback(
    (node: ZBookmarkListTreeNode) => pathName.includes(node.item.id),
    [pathName],
  );

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Fetch live lists data
  const {
    data: listsData,
    isPending,
    error,
    refetch,
  } = useBookmarkLists(undefined, {
    initialData,
  });
  const lists = augmentBookmarkListsWithInitialData(
    listsData,
    initialData?.lists ?? [],
  );

  // Client-side list search: all lists are already in memory, so filtering is
  // a flat name match. An empty query falls back to the normal tree.
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;
  const viewedListId = pathName.split("/").at(-1);
  // Search results start at each matched folder (the top-most match), not the
  // tree root: searching "B" in A > B > C yields a tree rooted at B with C
  // collapsed underneath and A shown as context on B. A match nested under
  // another match stays inside that ancestor's subtree rather than repeated.
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

  const searchParentPaths = useMemo(
    () =>
      new Map(
        isSearching
          ? lists.allPaths.map((path) => [
              path[path.length - 1].id,
              path
                .slice(0, -1)
                .map((list) => list.name)
                .join(" / "),
            ])
          : [],
      ),
    [isSearching, lists.allPaths],
  );

  // Check if any shared list is currently being viewed
  const isViewingSharedList = useMemo(() => {
    return lists.data.some(
      (list) => list.userRole !== "owner" && list.id === viewedListId,
    );
  }, [lists.data, pathName]);

  // Check if there are any shared lists
  const hasSharedLists = useMemo(() => {
    return lists.data.some((list) => list.userRole !== "owner");
  }, [lists.data]);

  const [sharedListsOpen, setSharedListsOpen] = useState(isViewingSharedList);

  // Auto-open shared lists if viewing one
  useEffect(() => {
    if (isViewingSharedList && !sharedListsOpen) {
      setSharedListsOpen(true);
    }
  }, [isViewingSharedList, sharedListsOpen]);

  // Drive the top/bottom gradient fades off the actual scroll position: the top
  // fade only shows once scrolled away from the top, the bottom fade hides once
  // scrolled to the very bottom.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflowing = scrollHeight - clientHeight > 1;
    setEdges({
      top: overflowing && scrollTop > 1,
      bottom: overflowing && scrollTop + clientHeight < scrollHeight - 1,
    });
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncEdges();
    // Re-measure after the first frame (initial layout settles) and once web
    // fonts finish loading: a font swap reflows the rows taller without firing
    // either observer below, which would otherwise leave the fades stale.
    const raf = requestAnimationFrame(syncEdges);
    void document.fonts?.ready.then(syncEdges);
    // ResizeObserver catches viewport/sidebar resizes; MutationObserver catches
    // content-height changes (folders expanding, lists loading in) that don't
    // re-render this component.
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    const mo = new MutationObserver(syncEdges);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [syncEdges]);

  return (
    <nav
      aria-label={t("lists.all_lists")}
      className="flex h-full max-h-full min-h-0 w-full min-w-0 flex-col"
    >
      {/* Scroll viewport with gradient fades top + bottom, so content melts
          into the sidebar at both edges instead of cutting off hard. */}
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "from-sidebar pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b to-transparent transition-opacity duration-200",
            edges.top ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={scrollRef}
          onScroll={syncEdges}
          className="sidebar-scrollbar h-full space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-contain text-sm sm:pr-2"
        >
          <div className="shrink-0">
            {showHeader && (
              <div className="flex justify-between pb-3">
                <p className="pl-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {t("lists.navigation.heading")}
                </p>
                <EditListModal>
                  <Button
                    variant="ghost"
                    size="none"
                    aria-label={t("lists.new_list")}
                  >
                    <Plus
                      className="mr-2 size-4 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </Button>
                </EditListModal>
              </div>
            )}
            {lists.data.length > 0 && (
              <div className="px-1 pb-2">
                <div className={searchFieldSurfaceClassName}>
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
                    startIcon={
                      <Search className="size-3.5 text-muted-foreground" />
                    }
                    endIcon={
                      query ? (
                        <button
                          type="button"
                          aria-label={t("actions.clear", {
                            defaultValue: "Clear",
                          })}
                          onClick={() => setQuery("")}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : undefined
                    }
                    className="h-8 rounded-[inherit] border-0 bg-transparent text-base shadow-none focus-visible:ring-0 sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
                  />
                </div>
              </div>
            )}
          </div>
          {isPending && (
            <div role="status" className="px-2 text-xs text-muted-foreground">
              {t("lists.navigation.loading")}
            </div>
          )}
          {error && (
            <div
              role="status"
              className="space-y-1 px-2 text-xs text-muted-foreground"
            >
              <p>{t("lists.navigation.load_error")}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refetch()}
              >
                {t("startup.retry")}
              </Button>
            </div>
          )}
          {isSearching ? (
            matchedRoots.length > 0 ? (
              <CollapsibleBookmarkLists
                listsData={{
                  ...lists,
                  root: Object.fromEntries(
                    matchedRoots.map((node) => [node.item.id, node]),
                  ),
                }}
                render={({ node, level, open, numBookmarks }) => (
                  <DroppableListSidebarItem
                    node={node}
                    level={level}
                    open={open}
                    numBookmarks={numBookmarks}
                    parentPath={
                      level === 0
                        ? searchParentPaths.get(node.item.id)
                        : undefined
                    }
                    selectedListId={selectedListId}
                    setSelectedListId={setSelectedListId}
                    onNavigate={onNavigate}
                  />
                )}
              />
            ) : (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t("lists.no_lists_found", { defaultValue: "No lists found" })}
              </div>
            )
          ) : (
            <>
              <SidebarItem
                as="div"
                onNavigate={onNavigate}
                collapseButton={<span className="size-6" />}
                logo={<span className="text-lg">📋</span>}
                name={t("lists.all_lists")}
                path={`/dashboard/lists`}
                linkClassName="px-1.5 py-1.5"
                right={<InvitationNotificationBadge />}
              />
              <SidebarItem
                as="div"
                onNavigate={onNavigate}
                collapseButton={<span className="size-6" />}
                logo={<span className="text-lg">⭐️</span>}
                name={t("lists.favourites")}
                path={`/dashboard/favourites`}
                linkClassName="px-1.5 py-1.5"
              />

              {/* Owned Lists */}
              <CollapsibleBookmarkLists
                listsData={lists}
                filter={(node) => node.item.userRole === "owner"}
                isOpenFunc={isNodeOpen}
                render={({ node, level, open, numBookmarks }) => (
                  <DroppableListSidebarItem
                    node={node}
                    level={level}
                    open={open}
                    numBookmarks={numBookmarks}
                    selectedListId={selectedListId}
                    setSelectedListId={setSelectedListId}
                    onNavigate={onNavigate}
                  />
                )}
              />

              {/* Shared Lists */}
              {hasSharedLists && (
                <Collapsible
                  open={sharedListsOpen}
                  onOpenChange={setSharedListsOpen}
                >
                  <SidebarItem
                    as="div"
                    collapseButton={
                      <CollapsibleTriggerChevron
                        triggerClassName="m-0"
                        className="size-4"
                        open={sharedListsOpen}
                      />
                    }
                    logo={<span className="text-lg">👥</span>}
                    name={t("lists.shared_lists")}
                    path="#"
                    linkClassName="px-1.5 py-1.5"
                  />
                  <CollapsibleContent>
                    <CollapsibleBookmarkLists
                      listsData={lists}
                      filter={(node) => node.item.userRole !== "owner"}
                      isOpenFunc={isNodeOpen}
                      indentOffset={1}
                      render={({ node, level, open, numBookmarks }) => (
                        <DroppableListSidebarItem
                          node={node}
                          level={level}
                          open={open}
                          numBookmarks={numBookmarks}
                          selectedListId={selectedListId}
                          setSelectedListId={setSelectedListId}
                          onNavigate={onNavigate}
                        />
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </div>
        <div
          className={cn(
            "from-sidebar pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t to-transparent transition-opacity duration-200",
            edges.bottom ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </nav>
  );
}
