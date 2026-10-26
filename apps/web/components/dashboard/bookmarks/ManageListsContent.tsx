"use client";

import type { ReactNode } from "react";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listsToTree } from "@karakeep/shared/utils/listUtils";
import { truncateListPath } from "../lists/listPath";

export function ManageListsContent({
  currentLists,
  listTree,
  renderRemove,
  selector,
}: {
  currentLists?: ZBookmarkList[];
  listTree?: Pick<ReturnType<typeof listsToTree>, "getPathById">;
  renderRemove: (list: ZBookmarkList) => ReactNode;
  selector: ReactNode;
}) {
  return (
    <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-sm font-medium">Current lists</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {currentLists?.length ?? 0}
          </span>
        </div>
        {currentLists?.length ? (
          <ul className="space-y-1.5">
            {currentLists.map((list) => {
              const path = listTree?.getPathById(list.id);
              const fullPath = path
                ?.map((item) => `${item.icon} ${item.name}`)
                .join(" / ");
              return (
                <li
                  key={list.id}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2"
                >
                  <p
                    className="min-w-0 flex-1 truncate text-sm text-foreground"
                    title={fullPath}
                  >
                    {path ? truncateListPath(path) : list.name}
                  </p>
                  {renderRemove(list)}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
            This bookmark is not in a list yet.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
        <div>
          <h3 className="text-sm font-medium">Add to a list</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose a destination to add this bookmark immediately.
          </p>
        </div>
        {selector}
      </section>
    </div>
  );
}
