"use client";

import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";
import { UserAvatar } from "@/components/ui/user-avatar";

type Editor =
  inferRouterOutputs<AppRouter>["bookmarks"]["getContentPermissions"]["editors"][number];

export function ContentEditors({
  editors,
  renderActions,
}: {
  editors: Editor[];
  renderActions: (editor: Editor) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {editors.map((editor) => (
        <div
          key={editor.id}
          className="flex items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={editor.name}
              image={editor.image}
              className="size-9"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{editor.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {editor.email}
              </p>
            </div>
          </div>
          {renderActions(editor)}
        </div>
      ))}
    </div>
  );
}
