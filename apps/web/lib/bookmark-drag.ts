import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { limitConcurrency } from "@karakeep/shared/concurrency";

/**
 * MIME type used in HTML5 drag-and-drop dataTransfer to identify
 * bookmark card drags (as opposed to file drops).
 */
export const BOOKMARK_DRAG_MIME = "application/x-karakeep-bookmark";
export const BOOKMARK_BATCH_DRAG_MIME = "application/x-karakeep-bookmarks";

export interface BookmarkDragData {
  bookmarkIds: string[];
  sourceListId?: string;
  selectionSession?: number;
}

/**
 * MIME type carrying the id of the manual list the dragged bookmark is being
 * viewed in (its "source" list), when editable. Lets a drop target turn a copy
 * into a move by removing the bookmark from this source list. Absent for
 * read-only lists and non-list views (all bookmarks, favourites, tags, search).
 */
export const BOOKMARK_SOURCE_LIST_MIME = "application/x-karakeep-source-list";

export function setBookmarkDragData(
  dataTransfer: Pick<DataTransfer, "setData" | "effectAllowed">,
  bookmarkId: string | string[],
  listContext?: Pick<ZBookmarkList, "id" | "type" | "userRole">,
  selectionSession?: number,
) {
  const bookmarkIds = [
    ...new Set(typeof bookmarkId === "string" ? [bookmarkId] : bookmarkId),
  ];
  dataTransfer.setData(BOOKMARK_DRAG_MIME, bookmarkIds[0] ?? "");
  dataTransfer.setData(
    BOOKMARK_BATCH_DRAG_MIME,
    JSON.stringify({ bookmarkIds, selectionSession }),
  );
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

export function getBookmarkDragData(
  dataTransfer: Pick<DataTransfer, "getData">,
): BookmarkDragData | null {
  const batch = dataTransfer.getData(BOOKMARK_BATCH_DRAG_MIME);
  let bookmarkIds: string[];
  let selectionSession: number | undefined;
  if (batch) {
    try {
      const parsed: unknown = JSON.parse(batch);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("bookmarkIds" in parsed) ||
        !Array.isArray(parsed.bookmarkIds) ||
        parsed.bookmarkIds.length === 0 ||
        !parsed.bookmarkIds.every(
          (id: unknown) => typeof id === "string" && id.length > 0,
        )
      )
        return null;
      bookmarkIds = [...new Set(parsed.bookmarkIds as string[])];
      if (
        "selectionSession" in parsed &&
        typeof parsed.selectionSession === "number"
      ) {
        selectionSession = parsed.selectionSession;
      }
    } catch {
      return null;
    }
  } else {
    const id = dataTransfer.getData(BOOKMARK_DRAG_MIME);
    if (!id) return null;
    bookmarkIds = [id];
  }
  return {
    bookmarkIds,
    selectionSession,
    sourceListId: dataTransfer.getData(BOOKMARK_SOURCE_LIST_MIME) || undefined,
  };
}

type MembershipMutation = (input: {
  bookmarkId: string;
  listId: string;
}) => Promise<unknown>;

/** Destination membership is never rolled back after a source-removal failure. */
export async function dropBookmarks({
  bookmarkIds,
  sourceListId,
  targetListId,
  addToList,
  removeFromList,
}: BookmarkDragData & {
  targetListId: string;
  addToList: MembershipMutation;
  removeFromList: MembershipMutation;
}) {
  if (sourceListId === targetListId) return null;
  const isMove = !!sourceListId;
  const results = await Promise.all(
    limitConcurrency(
      [...new Set(bookmarkIds)].map((bookmarkId) => async () => {
        try {
          await addToList({ bookmarkId, listId: targetListId });
        } catch {
          return { bookmarkId, outcome: "failed" as const };
        }
        if (sourceListId) {
          try {
            await removeFromList({ bookmarkId, listId: sourceListId });
          } catch {
            return { bookmarkId, outcome: "added-only" as const };
          }
        }
        return { bookmarkId, outcome: "completed" as const };
      }),
      5,
    ),
  );
  return {
    isMove,
    completedIds: results
      .filter((r) => r.outcome === "completed")
      .map((r) => r.bookmarkId),
    addedOnlyIds: results
      .filter((r) => r.outcome === "added-only")
      .map((r) => r.bookmarkId),
    failedIds: results
      .filter((r) => r.outcome === "failed")
      .map((r) => r.bookmarkId),
  };
}
