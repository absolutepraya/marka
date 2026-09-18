import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

import type { KarakeepDBTransaction } from "@karakeep/db";
import {
  bookmarkContentEditors,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  listCollaborators,
  offlineSyncFieldVersions,
  users,
} from "@karakeep/db/schema";
import { logEvent } from "@karakeep/shared-server";

import type { AuthedContext } from "..";
import {
  getEffectiveCollaboratorGrantsForOwner,
  getEffectiveListAccessUserIds,
} from "./listCollaborationAccess";

type PermissionDb = AuthedContext["db"] | KarakeepDBTransaction;

export interface BookmarkContentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface BookmarkContentEditor extends BookmarkContentUser {
  grantedAt: Date;
}

export interface BookmarkContentPermission {
  canEdit: boolean;
  canManage: boolean;
  hasCurrentManualView: boolean;
  textVersion: number;
}

export async function getBookmarkTextVersion(
  db: PermissionDb,
  bookmarkId: string,
): Promise<number> {
  const [version] = await db
    .select({ version: offlineSyncFieldVersions.version })
    .from(offlineSyncFieldVersions)
    .where(
      and(
        eq(offlineSyncFieldVersions.bookmarkId, bookmarkId),
        eq(offlineSyncFieldVersions.field, "text"),
      ),
    );
  return version?.version ?? 0;
}

async function bookmarkManualListIds(
  db: PermissionDb,
  bookmarkId: string,
  ownerId: string,
): Promise<string[]> {
  const rows = await db
    .select({ listId: bookmarksInLists.listId })
    .from(bookmarksInLists)
    .innerJoin(bookmarkLists, eq(bookmarkLists.id, bookmarksInLists.listId))
    .where(
      and(
        eq(bookmarksInLists.bookmarkId, bookmarkId),
        eq(bookmarkLists.userId, ownerId),
        eq(bookmarkLists.type, "manual"),
      ),
    );
  return rows.map(({ listId }) => listId);
}

async function currentManualViewPaths(
  ctx: AuthedContext,
  bookmarkId: string,
  ownerId: string,
  userId: string,
) {
  const listIds = await bookmarkManualListIds(ctx.db, bookmarkId, ownerId);
  if (listIds.length === 0) return [];

  const grants = await getEffectiveCollaboratorGrantsForOwner(
    ctx,
    ownerId,
    userId,
  );
  const targetListIds = new Set(listIds);
  return grants.filter(({ list }) => targetListIds.has(list.id));
}

async function isGrantActive(
  ctx: AuthedContext,
  bookmarkId: string,
  ownerId: string,
  userId: string,
  viewMembershipIds: string[],
  grantedAt: Date,
): Promise<boolean> {
  const paths = await currentManualViewPaths(ctx, bookmarkId, ownerId, userId);
  if (paths.length === 0) return false;

  const membershipIds = paths
    .map(({ grant }) => grant.membershipId)
    .filter((membershipId) => viewMembershipIds.includes(membershipId));
  if (membershipIds.length === 0) return false;
  const memberships = await ctx.db
    .select({ id: listCollaborators.id, addedAt: listCollaborators.addedAt })
    .from(listCollaborators)
    .where(inArray(listCollaborators.id, membershipIds));
  return memberships.some((membership) => membership.addedAt <= grantedAt);
}

async function removeInactiveGrant(
  db: PermissionDb,
  bookmarkId: string,
  userId: string,
) {
  const result = await db
    .delete(bookmarkContentEditors)
    .where(
      and(
        eq(bookmarkContentEditors.bookmarkId, bookmarkId),
        eq(bookmarkContentEditors.userId, userId),
      ),
    );
  if (result.changes > 0) {
    logEvent({
      "event.name": "bookmark.content_edit_revoke",
      "bookmark.id": bookmarkId,
      "content.editor_id": userId,
      "content.revoke_reason": "view_access_lost",
    });
  }
}

export async function getBookmarkContentPermission(
  ctx: AuthedContext,
  bookmarkId: string,
  userId = ctx.user.id,
): Promise<BookmarkContentPermission> {
  const [bookmark] = await ctx.db
    .select({ userId: bookmarks.userId, type: bookmarks.type })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }

  const textVersion = await getBookmarkTextVersion(ctx.db, bookmarkId);
  if (bookmark.type !== "text") {
    return {
      canEdit: false,
      canManage: bookmark.userId === userId,
      hasCurrentManualView: false,
      textVersion,
    };
  }
  if (bookmark.userId === userId) {
    return {
      canEdit: true,
      canManage: true,
      hasCurrentManualView: true,
      textVersion,
    };
  }

  const [grant] = await ctx.db
    .select({
      grantedAt: bookmarkContentEditors.grantedAt,
      viewMembershipIds: bookmarkContentEditors.viewMembershipIds,
    })
    .from(bookmarkContentEditors)
    .where(
      and(
        eq(bookmarkContentEditors.bookmarkId, bookmarkId),
        eq(bookmarkContentEditors.userId, userId),
      ),
    );
  const paths = await currentManualViewPaths(
    ctx,
    bookmarkId,
    bookmark.userId,
    userId,
  );
  const hasCurrentManualView = paths.length > 0;
  if (!grant) {
    return {
      canEdit: false,
      canManage: false,
      hasCurrentManualView,
      textVersion,
    };
  }

  const active =
    hasCurrentManualView &&
    (await isGrantActive(
      ctx,
      bookmarkId,
      bookmark.userId,
      userId,
      grant.viewMembershipIds,
      grant.grantedAt,
    ));
  if (!active) {
    await removeInactiveGrant(ctx.db, bookmarkId, userId);
  }
  return {
    canEdit: active,
    canManage: false,
    hasCurrentManualView,
    textVersion,
  };
}

export async function assertCanEditBookmarkContent(
  ctx: AuthedContext,
  bookmarkId: string,
): Promise<BookmarkContentPermission> {
  const permission = await getBookmarkContentPermission(ctx, bookmarkId);
  if (!permission.canEdit) {
    logEvent({
      "event.name": "bookmark.content_edit_denied",
      "bookmark.id": bookmarkId,
      "content.denial_reason": permission.hasCurrentManualView
        ? "not_granted"
        : "view_access_lost",
    });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to edit this bookmark's content",
    });
  }
  return permission;
}

export async function invalidateInactiveBookmarkContentEditorGrants(
  ctx: AuthedContext,
  bookmarkId: string,
): Promise<void> {
  const grants = await ctx.db
    .select({ userId: bookmarkContentEditors.userId })
    .from(bookmarkContentEditors)
    .where(eq(bookmarkContentEditors.bookmarkId, bookmarkId));
  for (const grant of grants) {
    await getBookmarkContentPermission(ctx, bookmarkId, grant.userId);
  }
}

export async function getBookmarkContentPermissions(
  ctx: AuthedContext,
  bookmarkId: string,
) {
  const [bookmark] = await ctx.db
    .select({ userId: bookmarks.userId, type: bookmarks.type })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }

  const current = await getBookmarkContentPermission(ctx, bookmarkId);
  if (bookmark.userId !== ctx.user.id || bookmark.type !== "text") {
    return {
      ...current,
      editors: [] as BookmarkContentEditor[],
      eligibleUsers: [] as BookmarkContentUser[],
    };
  }

  const grants = await ctx.db
    .select({
      userId: bookmarkContentEditors.userId,
      grantedAt: bookmarkContentEditors.grantedAt,
      viewMembershipIds: bookmarkContentEditors.viewMembershipIds,
    })
    .from(bookmarkContentEditors)
    .where(eq(bookmarkContentEditors.bookmarkId, bookmarkId));
  const activeGrants: typeof grants = [];
  for (const grant of grants) {
    if (
      await isGrantActive(
        ctx,
        bookmarkId,
        bookmark.userId,
        grant.userId,
        grant.viewMembershipIds,
        grant.grantedAt,
      )
    ) {
      activeGrants.push(grant);
    } else {
      await removeInactiveGrant(ctx.db, bookmarkId, grant.userId);
    }
  }

  const manualListIds = await bookmarkManualListIds(
    ctx.db,
    bookmarkId,
    bookmark.userId,
  );
  const accessByList = await getEffectiveListAccessUserIds(
    ctx,
    bookmark.userId,
    manualListIds,
  );
  const eligibleIds = new Set<string>();
  for (const ids of accessByList.values()) {
    ids.forEach((id) => eligibleIds.add(id));
  }
  eligibleIds.delete(bookmark.userId);

  const userIds = new Set([
    ...eligibleIds,
    ...activeGrants.map((grant) => grant.userId),
  ]);
  const userRows =
    userIds.size === 0
      ? []
      : await ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
          })
          .from(users)
          .where(inArray(users.id, [...userIds]));
  const usersById = new Map(userRows.map((user) => [user.id, user]));
  const activeEditorIds = new Set(activeGrants.map((grant) => grant.userId));
  const editors = activeGrants.flatMap((grant) => {
    const user = usersById.get(grant.userId);
    return user ? [{ ...user, grantedAt: grant.grantedAt }] : [];
  });

  return {
    ...current,
    editors,
    eligibleUsers: userRows.filter(
      (user) => eligibleIds.has(user.id) && !activeEditorIds.has(user.id),
    ),
  };
}

export async function grantBookmarkContentEditor(
  ctx: AuthedContext,
  bookmarkId: string,
  userId: string,
) {
  const [bookmark] = await ctx.db
    .select({ userId: bookmarks.userId, type: bookmarks.type })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }
  if (bookmark.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the bookmark owner can manage content editors",
    });
  }
  if (bookmark.type !== "text") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only text bookmarks can be shared for editing",
    });
  }
  if (userId === ctx.user.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The bookmark owner already has edit access",
    });
  }

  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  const paths = await currentManualViewPaths(
    ctx,
    bookmarkId,
    bookmark.userId,
    userId,
  );
  if (paths.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The user must have access through a shared manual list first",
    });
  }

  await ctx.db
    .insert(bookmarkContentEditors)
    .values({
      bookmarkId,
      userId,
      grantedAt: new Date(),
      viewMembershipIds: paths.map(({ grant }) => grant.membershipId),
    })
    .onConflictDoUpdate({
      target: [
        bookmarkContentEditors.bookmarkId,
        bookmarkContentEditors.userId,
      ],
      set: {
        grantedAt: new Date(),
        viewMembershipIds: paths.map(({ grant }) => grant.membershipId),
      },
    });
  logEvent({
    "event.name": "bookmark.content_edit_grant",
    "bookmark.id": bookmarkId,
    "content.editor_id": userId,
  });
}

export async function revokeBookmarkContentEditor(
  ctx: AuthedContext,
  bookmarkId: string,
  userId: string,
) {
  const [bookmark] = await ctx.db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }
  if (bookmark.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the bookmark owner can manage content editors",
    });
  }

  const result = await ctx.db
    .delete(bookmarkContentEditors)
    .where(
      and(
        eq(bookmarkContentEditors.bookmarkId, bookmarkId),
        eq(bookmarkContentEditors.userId, userId),
      ),
    );
  if (result.changes > 0) {
    logEvent({
      "event.name": "bookmark.content_edit_revoke",
      "bookmark.id": bookmarkId,
      "content.editor_id": userId,
      "content.revoke_reason": "owner",
    });
  }
}
