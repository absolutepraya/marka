import type { ZBookmarkList } from "@karakeep/shared/types/lists";

export function canRemoveBookmarkFromList(input: {
  listId: string | undefined;
  listType: "manual" | "smart" | undefined;
  userRole: "owner" | "editor" | "viewer" | "public" | undefined;
}) {
  return Boolean(
    input.listId &&
    input.listType === "manual" &&
    (input.userRole === "owner" || input.userRole === "editor"),
  );
}

export function canSelectBookmarkForBulkActions({
  bookmarkOwnerId,
  currentUserId,
  listContext,
}: {
  bookmarkOwnerId: string;
  currentUserId: string | undefined;
  listContext?: Pick<ZBookmarkList, "id" | "type" | "userRole">;
}) {
  return Boolean(
    currentUserId &&
    (bookmarkOwnerId === currentUserId ||
      canRemoveBookmarkFromList({
        listId: listContext?.id,
        listType: listContext?.type,
        userRole: listContext?.userRole,
      })),
  );
}
