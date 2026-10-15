import type { ZBookmarkList } from "@karakeep/shared/types/lists";

/**
 * MIME type used in HTML5 drag-and-drop dataTransfer to identify
 * bookmark card drags (as opposed to file drops).
 */
export const BOOKMARK_DRAG_MIME = "application/x-karakeep-bookmark";

/**
 * MIME type carrying the id of the manual list the dragged bookmark is being
 * viewed in (its "source" list), when editable. Lets a drop target turn a copy
 * into a move by removing the bookmark from this source list. Absent for
 * read-only lists and non-list views (all bookmarks, favourites, tags, search).
 */
export const BOOKMARK_SOURCE_LIST_MIME = "application/x-karakeep-source-list";

export function setBookmarkDragData(
  dataTransfer: Pick<DataTransfer, "setData" | "effectAllowed">,
  bookmarkId: string,
  listContext?: Pick<ZBookmarkList, "id" | "type" | "userRole">,
) {
  dataTransfer.setData(BOOKMARK_DRAG_MIME, bookmarkId);
  if (
    listContext?.type === "manual" &&
    (listContext.userRole === "owner" || listContext.userRole === "editor")
  ) {
    dataTransfer.setData(BOOKMARK_SOURCE_LIST_MIME, listContext.id);
    dataTransfer.effectAllowed = "copyMove";
  } else {
    dataTransfer.effectAllowed = "copy";
  }
}
