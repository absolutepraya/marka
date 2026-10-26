"use client";

import type { ComponentProps } from "react";
import { ManageListsContent } from "@/components/dashboard/bookmarks/ManageListsContent";
import { ContentEditors } from "@/components/dashboard/bookmarks/ContentEditors";
import { CollaboratorsContent } from "@/components/dashboard/lists/CollaboratorsContent";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";
import { ChevronsUpDown, Trash2, UserRoundX, X } from "lucide-react";

export const dialogSurfaceNames = [
  "manage-lists",
  "collaborators",
  "content-editors",
] as const;
export type DialogSurfaceName = (typeof dialogSurfaceNames)[number];

const people = ["Alex Morgan", "Jamie Rivera", "Robin Chen"].map(
  (name, index) => ({
    id: `fixture-person-${index}`,
    name,
    email: `reader${index + 1}@example.com`,
    image: null,
  }),
);
const collaborators: ComponentProps<
  typeof CollaboratorsContent
>["collaborators"] = people.slice(1).map((user, index) => ({
  id: `fixture-collaborator-${index}`,
  userId: user.id,
  user,
  role: index === 0 ? "editor" : "viewer",
  recursive: false,
  inherited: false,
  status: "accepted",
  addedAt: new Date("2000-01-01T00:00:00Z"),
  invitedAt: new Date("2000-01-01T00:00:00Z"),
  expired: false,
}));
const lists: NonNullable<
  ComponentProps<typeof ManageListsContent>["currentLists"]
> = ["Reading", "Research"].map((name, index) => ({
  id: `fixture-list-${index}`,
  name,
  icon: "📚",
  description: null,
  parentId: null,
  type: "manual",
  public: false,
  hasCollaborators: false,
  userRole: "owner",
}));

/** Synthetic display data and inert action slots, without live modal controllers. */
export function DialogFixture({ name }: { name: DialogSurfaceName }) {
  const { t } = useTranslation();
  switch (name) {
    case "manage-lists":
      return (
        <ManageListsContent
          currentLists={lists}
          renderRemove={() => (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-lg"
              aria-label={t("actions.remove_from_list")}
            >
              <X className="size-4" />
            </Button>
          )}
          selector={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={false}
              className="h-10 w-full min-w-0 justify-between sm:h-11"
            >
              <span className="min-w-0 flex-1 truncate">Select a list</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          }
        />
      );
    case "collaborators":
      return (
        <CollaboratorsContent
          owner={people[0]}
          collaborators={collaborators}
          renderActions={(collaborator) => (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={collaborator.role}>
                <SelectTrigger
                  className="w-28"
                  aria-label={t("lists.collaboration.collaborator_role")}
                >
                  <SelectValue>
                    {t(`lists.collaborators.${collaborator.role}`)}
                  </SelectValue>
                </SelectTrigger>
              </Select>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={false} readOnly />
                {t("lists.collaboration.nested_lists")}
              </label>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("lists.collaboration.remove_aria", {
                  name: collaborator.user.name,
                })}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          )}
        />
      );
    case "content-editors":
      return (
        <ContentEditors
          editors={people.slice(1).map((person) => ({
            ...person,
            grantedAt: new Date("2000-01-01T00:00:00Z"),
          }))}
          renderActions={() => (
            <Button
              variant="outline"
              size="sm"
              className="min-h-9 shrink-0 gap-2"
            >
              <UserRoundX className="size-4" aria-hidden="true" />
              {t("shared_content.revoke")}
            </Button>
          )}
        />
      );
  }
}
