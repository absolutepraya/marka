import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, inArray, max } from "drizzle-orm";

import { SqliteError } from "@karakeep/db";
import type { KarakeepDBTransaction } from "@karakeep/db";
import {
  bookmarkLinks,
  bookmarkContentEditors,
  bookmarks,
  bookmarksInLists,
  bookmarkTexts,
  bookmarkTags,
  listCollaborators,
  rssFeedImportsTable,
  rssFeedsTable,
  offlineSyncEvents,
  offlineSyncFieldVersions,
  offlineSyncMutationReceipts,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import {
  EmbeddingsQueue,
  OpenAIQueue,
  QueuePriority,
  QuotaService,
  logEvent,
  triggerSearchReindex,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import type { EnqueueOptions } from "@karakeep/shared/queueing";
import { zCreateTagRequestSchema } from "@karakeep/shared/types/tags";
import type {
  ZOfflineSyncBookmarkFieldVersion,
  ZOfflineSyncConflict,
  ZOfflineSyncEntityType,
  ZOfflineSyncMutation,
  ZOfflineSyncOperation,
  ZOfflineSyncPullResult,
  ZOfflineSyncPushResult,
  ZOfflineSyncSnapshot,
} from "@karakeep/shared/types/offlineSync";

import type { AuthedContext } from "../index";
import { Bookmark } from "./bookmarks";
import {
  assertCanEditBookmarkContent,
  getBookmarkContentPermission,
} from "./bookmarkContentPermissions";
import { RuleEngine } from "../lib/ruleEngine";
import { List } from "./lists";

import { WebhooksService } from "./webhooks.service";
const bookmarkFieldNames = new Set([
  "title",
  "archived",
  "favourited",
  "note",
  "summary",
  "url",
  "description",
  "author",
  "publisher",
  "text",
  "tags",
]);
const terminalOfflineSyncErrorCodes = new Set([
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
]);

function asTransactionContext(
  ctx: AuthedContext,
  db: KarakeepDBTransaction,
): AuthedContext {
  return { ...ctx, db } as unknown as AuthedContext;
}

function cursorForSequence(sequence: number | null | undefined): string {
  return String(sequence ?? 0);
}

async function currentCursor(
  tx: KarakeepDBTransaction,
  userId: string,
): Promise<string> {
  const [result] = await tx
    .select({ sequence: max(offlineSyncEvents.sequence) })
    .from(offlineSyncEvents)
    .where(eq(offlineSyncEvents.userId, userId));
  return cursorForSequence(result?.sequence);
}

async function getOfflineSyncBookmarkFieldVersions(
  tx: KarakeepDBTransaction,
  bookmarkIds: string[],
): Promise<ZOfflineSyncBookmarkFieldVersion[]> {
  if (bookmarkIds.length === 0) return [];

  return await tx
    .select({
      bookmarkId: offlineSyncFieldVersions.bookmarkId,
      field: offlineSyncFieldVersions.field,
      version: offlineSyncFieldVersions.version,
    })
    .from(offlineSyncFieldVersions)
    .where(inArray(offlineSyncFieldVersions.bookmarkId, bookmarkIds));
}

async function getBookmarkFieldValue(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
  field: string,
): Promise<unknown> {
  switch (field) {
    case "title":
    case "archived":
    case "favourited":
    case "note":
    case "summary": {
      const [bookmark] = await tx
        .select({
          title: bookmarks.title,
          archived: bookmarks.archived,
          favourited: bookmarks.favourited,
          note: bookmarks.note,
          summary: bookmarks.summary,
        })
        .from(bookmarks)
        .where(eq(bookmarks.id, bookmarkId));
      return bookmark?.[field];
    }
    case "url":
    case "description":
    case "author":
    case "publisher": {
      const [link] = await tx
        .select({
          url: bookmarkLinks.url,
          description: bookmarkLinks.description,
          author: bookmarkLinks.author,
          publisher: bookmarkLinks.publisher,
        })
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId));
      return link?.[field];
    }
    case "text": {
      const [text] = await tx
        .select({ text: bookmarkTexts.text })
        .from(bookmarkTexts)
        .where(eq(bookmarkTexts.id, bookmarkId));
      return text?.text;
    }
    case "tags": {
      const tags = await tx
        .select({ id: bookmarkTags.id })
        .from(tagsOnBookmarks)
        .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
        .where(eq(tagsOnBookmarks.bookmarkId, bookmarkId));
      return tags.map((tag) => tag.id).sort();
    }
    default:
      return undefined;
  }
}

async function assertBookmarkOwner(
  tx: KarakeepDBTransaction,
  userId: string,
  bookmarkId: string,
): Promise<void> {
  const [bookmark] = await tx
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));

  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }
  if (bookmark.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to modify this bookmark",
    });
  }
}

async function assertBookmarkMutationAccess(
  ctx: AuthedContext,
  tx: KarakeepDBTransaction,
  mutation: Extract<
    ZOfflineSyncMutation,
    { kind: "bookmark.update" | "bookmark.tags" }
  >,
): Promise<void> {
  const [bookmark] = await tx
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, mutation.bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }
  if (bookmark.userId === ctx.user.id) return;

  const isContentOnlyUpdate =
    mutation.kind === "bookmark.update" &&
    Object.keys(mutation.fields).length === 1 &&
    typeof mutation.fields.text === "string";
  if (isContentOnlyUpdate) {
    await assertCanEditBookmarkContent(
      asTransactionContext(ctx, tx),
      mutation.bookmarkId,
    );
    return;
  }

  logEvent({
    "event.name": "bookmark.content_edit_denied",
    "bookmark.id": mutation.bookmarkId,
    "content.denial_reason": "unsupported_update",
  });
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "User is not allowed to modify this bookmark",
  });
}

async function assertBookmarkExists(
  tx: KarakeepDBTransaction,
  bookmarkId: string,
): Promise<void> {
  const [bookmark] = await tx
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  if (!bookmark) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bookmark not found" });
  }
}

async function applyBookmarkListMembership(
  ctx: AuthedContext,
  tx: KarakeepDBTransaction,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.listMembership" }>,
): Promise<{ changed: boolean; listId: string; listOwnerId: string }> {
  const transactionContext = asTransactionContext(ctx, tx);
  const list = await List.fromId(transactionContext, mutation.listId);
  list.ensureCanEdit();

  if (mutation.action === "add") {
    await assertBookmarkOwner(tx, ctx.user.id, mutation.bookmarkId);
  } else {
    await assertBookmarkExists(tx, mutation.bookmarkId);
  }

  const [membership] = await tx
    .select({ bookmarkId: bookmarksInLists.bookmarkId })
    .from(bookmarksInLists)
    .where(
      and(
        eq(bookmarksInLists.bookmarkId, mutation.bookmarkId),
        eq(bookmarksInLists.listId, mutation.listId),
      ),
    );
  const hasMembership = membership !== undefined;

  if (mutation.action === "add" && !hasMembership) {
    await list.addBookmark(mutation.bookmarkId);
  }
  if (mutation.action === "remove" && hasMembership) {
    await list.removeBookmark(mutation.bookmarkId);
  }

  return {
    changed:
      (mutation.action === "add" && !hasMembership) ||
      (mutation.action === "remove" && hasMembership),
    listId: mutation.listId,
    listOwnerId: list.asZBookmarkList().userId,
  };
}

async function applyBookmarkDelete(
  ctx: AuthedContext,
  tx: KarakeepDBTransaction,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.delete" }>,
): Promise<void> {
  await assertBookmarkOwner(tx, ctx.user.id, mutation.bookmarkId);
  const transactionContext = asTransactionContext(ctx, tx);
  const bookmark = await Bookmark.fromId(
    transactionContext,
    mutation.bookmarkId,
    false,
  );
  await bookmark.delete(async (deleteTx) => {
    await recordOfflineSyncEvents(
      deleteTx,
      ctx.user.id,
      await getOfflineSyncBookmarkRecipientIds(
        ctx,
        deleteTx,
        ctx.user.id,
        mutation.bookmarkId,
      ),
      "bookmark",
      mutation.bookmarkId,
      "delete",
      [],
    );
  });
}

async function applyBookmarkUpdate(
  tx: KarakeepDBTransaction,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.update" }>,
): Promise<void> {
  const { bookmarkId, fields } = mutation;
  const commonUpdates: {
    title?: string | null;
    archived?: boolean;
    favourited?: boolean;
    note?: string;
    summary?: string | null;
    summaryProvenance?: "manual";
    summaryStale?: boolean;
    modifiedAt: Date;
  } = { modifiedAt: new Date() };
  let hasCommonUpdate = false;

  if (fields.title !== undefined) {
    commonUpdates.title = fields.title;
    hasCommonUpdate = true;
  }
  if (fields.archived !== undefined) {
    commonUpdates.archived = fields.archived;
    hasCommonUpdate = true;
  }
  if (fields.favourited !== undefined) {
    commonUpdates.favourited = fields.favourited;
    hasCommonUpdate = true;
  }
  if (fields.note !== undefined) {
    commonUpdates.note = fields.note;
    hasCommonUpdate = true;
  }
  if (fields.summary !== undefined) {
    commonUpdates.summary = fields.summary;
    commonUpdates.summaryProvenance = "manual";
    commonUpdates.summaryStale = false;
    hasCommonUpdate = true;
  }

  if (hasCommonUpdate) {
    await tx
      .update(bookmarks)
      .set(commonUpdates)
      .where(eq(bookmarks.id, bookmarkId));
  }

  const linkUpdates: {
    url?: string;
    description?: string | null;
    author?: string | null;
    publisher?: string | null;
  } = {};
  if (fields.url !== undefined) linkUpdates.url = fields.url.trim();
  if (fields.description !== undefined)
    linkUpdates.description = fields.description;
  if (fields.author !== undefined) linkUpdates.author = fields.author;
  if (fields.publisher !== undefined) linkUpdates.publisher = fields.publisher;

  if (Object.keys(linkUpdates).length > 0) {
    const result = await tx
      .update(bookmarkLinks)
      .set(linkUpdates)
      .where(eq(bookmarkLinks.id, bookmarkId));
    if (result.changes === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot update link fields on a non-link bookmark",
      });
    }
    if (!hasCommonUpdate) {
      await tx
        .update(bookmarks)
        .set({ modifiedAt: new Date() })
        .where(eq(bookmarks.id, bookmarkId));
    }
  }

  if (fields.text !== undefined) {
    const result = await tx
      .update(bookmarkTexts)
      .set({ text: fields.text })
      .where(eq(bookmarkTexts.id, bookmarkId));
    if (result.changes === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot update text on a non-text bookmark",
      });
    }
    if (!hasCommonUpdate && Object.keys(linkUpdates).length === 0) {
      await tx
        .update(bookmarks)
        .set({ modifiedAt: new Date() })
        .where(eq(bookmarks.id, bookmarkId));
    }
  }
}

interface BookmarkTagDelta {
  attached: string[];
  detached: string[];
}

async function applyBookmarkTags(
  tx: KarakeepDBTransaction,
  userId: string,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.tags" }>,
): Promise<BookmarkTagDelta> {
  const tagIds = [...new Set(mutation.tagIds)];
  const createdTags = mutation.createdTags.map((tag) => {
    const parsed = zCreateTagRequestSchema.safeParse({ name: tag.name });
    if (!parsed.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create an invalid tag offline",
      });
    }
    return { id: tag.id, name: parsed.data.name };
  });
  if (
    new Set(createdTags.map((tag) => tag.id)).size !== createdTags.length ||
    createdTags.some((tag) => !tagIds.includes(tag.id))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Created tags must be included in the requested tag set",
    });
  }
  if (createdTags.length > 0) {
    const existingCreatedTags = await tx
      .select({ id: bookmarkTags.id })
      .from(bookmarkTags)
      .where(
        inArray(
          bookmarkTags.id,
          createdTags.map((tag) => tag.id),
        ),
      );
    if (existingCreatedTags.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "An offline-created tag ID already exists",
      });
    }
    try {
      await tx.insert(bookmarkTags).values(
        createdTags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          userId,
        })),
      );
    } catch (error) {
      if (
        error instanceof SqliteError &&
        error.code.startsWith("SQLITE_CONSTRAINT")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tag name already exists for this user",
        });
      }
      throw error;
    }
  }
  if (tagIds.length > 0) {
    const ownedTags = await tx
      .select({ id: bookmarkTags.id })
      .from(bookmarkTags)
      .where(
        and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.id, tagIds)),
      );
    if (ownedTags.length !== tagIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot attach tags owned by another user",
      });
    }
  }

  const currentTags = await tx
    .select({ tagId: tagsOnBookmarks.tagId })
    .from(tagsOnBookmarks)
    .where(eq(tagsOnBookmarks.bookmarkId, mutation.bookmarkId));
  const currentTagIds = new Set(currentTags.map(({ tagId }) => tagId));
  const requestedTagIds = new Set(tagIds);
  const detached = currentTags
    .map(({ tagId }) => tagId)
    .filter((tagId) => !requestedTagIds.has(tagId));
  const attached = tagIds.filter((tagId) => !currentTagIds.has(tagId));

  if (detached.length > 0) {
    await tx
      .delete(tagsOnBookmarks)
      .where(
        and(
          eq(tagsOnBookmarks.bookmarkId, mutation.bookmarkId),
          inArray(tagsOnBookmarks.tagId, detached),
        ),
      );
  }
  if (attached.length > 0) {
    await tx.insert(tagsOnBookmarks).values(
      attached.map((tagId) => ({
        bookmarkId: mutation.bookmarkId,
        tagId,
        attachedBy: "human" as const,
      })),
    );
  }
  if (attached.length > 0 || detached.length > 0) {
    await tx
      .update(bookmarks)
      .set({ modifiedAt: new Date() })
      .where(eq(bookmarks.id, mutation.bookmarkId));
  }

  return { attached, detached };
}

async function applyTextBookmarkCreate(
  ctx: AuthedContext,
  tx: KarakeepDBTransaction,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.create" }>,
): Promise<number | null> {
  const quotaResult = await QuotaService.canCreateBookmark(tx, ctx.user.id);
  if (!quotaResult.result) {
    throw new TRPCError({ code: "FORBIDDEN", message: quotaResult.error });
  }
  await tx.insert(bookmarks).values({
    id: mutation.bookmarkId,
    userId: ctx.user.id,
    title: mutation.bookmark.title,
    type: mutation.bookmark.type,
    archived: mutation.bookmark.archived,
    favourited: mutation.bookmark.favourited,
    note: mutation.bookmark.note,
    summary: mutation.bookmark.summary,
    summaryProvenance:
      mutation.bookmark.summary !== undefined ? "manual" : undefined,
    summaryStale: false,
    createdAt: mutation.bookmark.createdAt,
    source: "web",
    summarizationStatus: null,
  });
  await tx.insert(bookmarkTexts).values({
    id: mutation.bookmarkId,
    text: mutation.bookmark.text,
    sourceUrl: mutation.bookmark.sourceUrl,
  });
  const [sequence] = await recordOfflineSyncEvents(
    tx,
    ctx.user.id,
    [ctx.user.id],
    "bookmark",
    mutation.bookmarkId,
    "create",
    ["title", "archived", "favourited", "note", "summary", "text"],
  );
  return sequence;
}

async function triggerBookmarkUpdateEffects(
  ctx: AuthedContext,
  mutation: Extract<
    ZOfflineSyncMutation,
    { kind: "bookmark.update" | "bookmark.tags" }
  >,
  tagDelta: BookmarkTagDelta | undefined,
): Promise<void> {
  const bookmark = (
    await Bookmark.fromId(ctx, mutation.bookmarkId, false)
  ).asZBookmark();

  const ruleEvents =
    mutation.kind === "bookmark.tags"
      ? [
          ...(tagDelta?.detached.map((tagId) => ({
            type: "tagRemoved" as const,
            tagId,
          })) ?? []),
          ...(tagDelta?.attached.map((tagId) => ({
            type: "tagAdded" as const,
            tagId,
          })) ?? []),
        ]
      : [
          ...(mutation.fields.favourited === true
            ? [{ type: "favourited" as const }]
            : []),
          ...(mutation.fields.archived === true
            ? [{ type: "archived" as const }]
            : []),
        ];

  await Promise.all([
    ruleEvents.length > 0
      ? RuleEngine.triggerOnEvent(
          bookmark.userId,
          mutation.bookmarkId,
          ruleEvents,
          undefined,
          ctx.db,
        )
      : Promise.resolve(),
    triggerSearchReindex(mutation.bookmarkId, { groupId: ctx.user.id }),
    new WebhooksService(ctx.db).triggerWebhook(
      mutation.bookmarkId,
      "edited",
      bookmark.userId,
      { groupId: ctx.user.id },
    ),
  ]);
}

async function triggerTextBookmarkCreateEffects(
  ctx: AuthedContext,
  mutation: Extract<ZOfflineSyncMutation, { kind: "bookmark.create" }>,
): Promise<void> {
  const options: EnqueueOptions = {
    priority: QueuePriority.Default,
    groupId: ctx.user.id,
  };
  const backgroundWork = serverConfig.embedding.enableAutoIndexing
    ? EmbeddingsQueue.enqueue(
        {
          bookmarkId: mutation.bookmarkId,
          type: "embed",
          runTaggingOnComplete: true,
        },
        options,
      )
    : OpenAIQueue.enqueue(
        { bookmarkId: mutation.bookmarkId, type: "tag" },
        options,
      );
  await Promise.all([
    backgroundWork,
    RuleEngine.triggerOnEvent(
      ctx.user.id,
      mutation.bookmarkId,
      [{ type: "bookmarkAdded" }],
      options,
      ctx.db,
    ),
    triggerSearchReindex(mutation.bookmarkId, options),
    new WebhooksService(ctx.db).triggerWebhook(
      mutation.bookmarkId,
      "created",
      ctx.user.id,
      options,
    ),
  ]);
}

async function advanceOfflineSyncFieldVersions(
  tx: KarakeepDBTransaction,
  entityType: ZOfflineSyncEntityType,
  entityId: string,
  operation: ZOfflineSyncOperation,
  changedFields: string[],
): Promise<void> {
  if (entityType !== "bookmark" || operation !== "update") return;

  for (const field of changedFields) {
    if (!bookmarkFieldNames.has(field)) continue;
    const [existing] = await tx
      .select({ version: offlineSyncFieldVersions.version })
      .from(offlineSyncFieldVersions)
      .where(
        and(
          eq(offlineSyncFieldVersions.bookmarkId, entityId),
          eq(offlineSyncFieldVersions.field, field),
        ),
      );
    const version = (existing?.version ?? 0) + 1;
    await tx
      .insert(offlineSyncFieldVersions)
      .values({ bookmarkId: entityId, field, version })
      .onConflictDoUpdate({
        target: [
          offlineSyncFieldVersions.bookmarkId,
          offlineSyncFieldVersions.field,
        ],
        set: { version },
      });
  }
}

export async function recordOfflineSyncEvent(
  tx: KarakeepDBTransaction,
  userId: string,
  entityType: ZOfflineSyncEntityType,
  entityId: string,
  operation: ZOfflineSyncOperation,
  changedFields: string[],
): Promise<number> {
  const [event] = await tx
    .insert(offlineSyncEvents)
    .values({
      userId,
      entityType,
      entityId,
      operation,
      changedFields,
      createdAt: new Date(),
    })
    .returning({ sequence: offlineSyncEvents.sequence });
  return event.sequence;
}

export async function getOfflineSyncBookmarkRecipientIds(
  ctx: AuthedContext,
  tx: KarakeepDBTransaction,
  ownerId: string,
  bookmarkId: string,
): Promise<string[]> {
  const [bookmark] = await tx
    .select({ ownerId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId));
  const collaborators = await tx
    .select({ userId: listCollaborators.userId })
    .from(bookmarksInLists)
    .innerJoin(
      listCollaborators,
      eq(listCollaborators.listId, bookmarksInLists.listId),
    )
    .where(eq(bookmarksInLists.bookmarkId, bookmarkId));

  const contentEditors = await tx
    .select({ userId: bookmarkContentEditors.userId })
    .from(bookmarkContentEditors)
    .where(eq(bookmarkContentEditors.bookmarkId, bookmarkId));
  const activeContentEditors = [] as string[];
  const transactionContext = asTransactionContext(ctx, tx);
  for (const { userId } of contentEditors) {
    const permission = await getBookmarkContentPermission(
      transactionContext,
      bookmarkId,
      userId,
    );
    if (permission.canEdit) {
      activeContentEditors.push(userId);
    }
  }

  return [
    ...new Set([
      bookmark?.ownerId ?? ownerId,
      ...collaborators.map(({ userId }) => userId),
      ...activeContentEditors,
    ]),
  ];
}

export async function recordOfflineSyncEvents(
  tx: KarakeepDBTransaction,
  ownerId: string,
  recipientIds: string[],
  entityType: ZOfflineSyncEntityType,
  entityId: string,
  operation: ZOfflineSyncOperation,
  changedFields: string[],
): Promise<number[]> {
  await advanceOfflineSyncFieldVersions(
    tx,
    entityType,
    entityId,
    operation,
    changedFields,
  );

  const sequences: number[] = [];
  for (const userId of new Set([ownerId, ...recipientIds])) {
    sequences.push(
      await recordOfflineSyncEvent(
        tx,
        userId,
        entityType,
        entityId,
        operation,
        changedFields,
      ),
    );
  }
  return sequences;
}

export async function buildOfflineSyncSnapshot(
  ctx: AuthedContext,
): Promise<ZOfflineSyncSnapshot> {
  return await ctx.db.transaction(async (tx) => {
    const transactionContext = asTransactionContext(ctx, tx);
    const [ownedBookmarks, sharedBookmarks, lists] = await Promise.all([
      tx
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.userId, ctx.user.id)),
      tx
        .select({ id: bookmarksInLists.bookmarkId })
        .from(bookmarksInLists)
        .innerJoin(
          listCollaborators,
          eq(listCollaborators.listId, bookmarksInLists.listId),
        )
        .where(eq(listCollaborators.userId, ctx.user.id)),
      List.getAll(transactionContext),
    ]);
    const bookmarkIds = new Set([
      ...ownedBookmarks.map((bookmark) => bookmark.id),
      ...sharedBookmarks.map((bookmark) => bookmark.id),
    ]);
    const snapshotLists = lists.map((list) => list.asZBookmarkList());
    const listIds = snapshotLists.map((list) => list.id);
    const bookmarkRows = await Promise.all(
      [...bookmarkIds].map(async (bookmarkId) =>
        (
          await Bookmark.fromId(transactionContext, bookmarkId, false)
        ).asZBookmark(),
      ),
    );
    const [bookmarkListMemberships, bookmarkFieldVersions] = await Promise.all([
      bookmarkIds.size === 0 || listIds.length === 0
        ? []
        : tx
            .select({
              bookmarkId: bookmarksInLists.bookmarkId,
              listId: bookmarksInLists.listId,
            })
            .from(bookmarksInLists)
            .where(
              and(
                inArray(bookmarksInLists.bookmarkId, [...bookmarkIds]),
                inArray(bookmarksInLists.listId, listIds),
              ),
            ),
      getOfflineSyncBookmarkFieldVersions(tx, [...bookmarkIds]),
    ]);
    const bookmarkRssFeedMemberships =
      bookmarkIds.size === 0
        ? []
        : (
            await tx
              .select({
                bookmarkId: rssFeedImportsTable.bookmarkId,
                rssFeedId: rssFeedImportsTable.rssFeedId,
              })
              .from(rssFeedImportsTable)
              .innerJoin(
                rssFeedsTable,
                eq(rssFeedImportsTable.rssFeedId, rssFeedsTable.id),
              )
              .where(
                and(
                  inArray(rssFeedImportsTable.bookmarkId, [...bookmarkIds]),
                  eq(rssFeedsTable.userId, ctx.user.id),
                ),
              )
          ).flatMap(({ bookmarkId, rssFeedId }) =>
            bookmarkId === null ? [] : [{ bookmarkId, rssFeedId }],
          );

    return {
      bookmarks: bookmarkRows,
      lists: snapshotLists,
      bookmarkListMemberships,
      bookmarkRssFeedMemberships,
      bookmarkFieldVersions,
      cursor: await currentCursor(tx, ctx.user.id),
    };
  });
}

export async function pullOfflineSyncEvents(
  ctx: AuthedContext,
  cursor: string,
): Promise<ZOfflineSyncPullResult> {
  const sequence = Number(cursor);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid sync cursor",
    });
  }

  return await ctx.db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(offlineSyncEvents)
      .where(
        and(
          eq(offlineSyncEvents.userId, ctx.user.id),
          gt(offlineSyncEvents.sequence, sequence),
        ),
      )
      .orderBy(asc(offlineSyncEvents.sequence));
    const bookmarkEventIds = [
      ...new Set(
        events
          .filter((event) => event.entityType === "bookmark")
          .map((event) => event.entityId),
      ),
    ];
    const [ownedBookmarks, sharedBookmarks] = await Promise.all([
      bookmarkEventIds.length === 0
        ? []
        : tx
            .select({ id: bookmarks.id })
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.userId, ctx.user.id),
                inArray(bookmarks.id, bookmarkEventIds),
              ),
            ),
      bookmarkEventIds.length === 0
        ? []
        : tx
            .select({ id: bookmarksInLists.bookmarkId })
            .from(bookmarksInLists)
            .innerJoin(
              listCollaborators,
              eq(listCollaborators.listId, bookmarksInLists.listId),
            )
            .where(
              and(
                eq(listCollaborators.userId, ctx.user.id),
                inArray(bookmarksInLists.bookmarkId, bookmarkEventIds),
              ),
            ),
    ]);
    const authorizedBookmarkIds = [
      ...new Set([
        ...ownedBookmarks.map((bookmark) => bookmark.id),
        ...sharedBookmarks.map((bookmark) => bookmark.id),
      ]),
    ];
    const fieldVersions = await getOfflineSyncBookmarkFieldVersions(
      tx,
      authorizedBookmarkIds,
    );

    return {
      events: events.map((event) => ({
        ...event,
        entityType: event.entityType as ZOfflineSyncEntityType,
        operation: event.operation as ZOfflineSyncOperation,
        fieldVersions: fieldVersions.filter(
          (fieldVersion) =>
            event.entityType === "bookmark" &&
            fieldVersion.bookmarkId === event.entityId &&
            event.changedFields.includes(fieldVersion.field),
        ),
      })),
      cursor: await currentCursor(tx, ctx.user.id),
    };
  });
}

export async function applyOfflineSyncMutations(
  ctx: AuthedContext,
  mutations: ZOfflineSyncMutation[],
): Promise<ZOfflineSyncPushResult> {
  if (mutations.length !== 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Offline sync pushes require exactly one mutation",
    });
  }

  let appliedMutation:
    | Extract<
        ZOfflineSyncMutation,
        { kind: "bookmark.update" | "bookmark.tags" | "bookmark.create" }
      >
    | undefined;
  let appliedTagDelta: BookmarkTagDelta | undefined;
  try {
    const result = await ctx.db.transaction(
      async (tx) => {
        const mutation = mutations[0];
        const [receipt] = await tx
          .select({ result: offlineSyncMutationReceipts.result })
          .from(offlineSyncMutationReceipts)
          .where(
            and(
              eq(offlineSyncMutationReceipts.userId, ctx.user.id),
              eq(
                offlineSyncMutationReceipts.idempotencyKey,
                mutation.idempotencyKey,
              ),
            ),
          );
        if (receipt) return receipt.result as ZOfflineSyncPushResult;
        try {
          if (mutation.kind === "bookmark.listMembership") {
            const membership = await applyBookmarkListMembership(
              ctx,
              tx,
              mutation,
            );
            if (membership.changed) {
              const collaborators = await tx
                .select({ userId: listCollaborators.userId })
                .from(listCollaborators)
                .where(eq(listCollaborators.listId, membership.listId));
              await recordOfflineSyncEvents(
                tx,
                membership.listOwnerId,
                collaborators.map((collaborator) => collaborator.userId),
                "list",
                membership.listId,
                "update",
                ["bookmarks"],
              );
            }
            const result = {
              acknowledged: [mutation.idempotencyKey],
              conflicts: [],
              rejections: [],
              cursor: await currentCursor(tx, ctx.user.id),
            };
            await tx.insert(offlineSyncMutationReceipts).values({
              userId: ctx.user.id,
              idempotencyKey: mutation.idempotencyKey,
              result,
              createdAt: new Date(),
            });
            return result;
          }

          if (mutation.kind === "bookmark.delete") {
            await applyBookmarkDelete(ctx, tx, mutation);
            const result = {
              acknowledged: [mutation.idempotencyKey],
              conflicts: [],
              rejections: [],
              cursor: await currentCursor(tx, ctx.user.id),
            };
            await tx.insert(offlineSyncMutationReceipts).values({
              userId: ctx.user.id,
              idempotencyKey: mutation.idempotencyKey,
              result,
              createdAt: new Date(),
            });
            return result;
          }

          if (mutation.kind === "bookmark.create") {
            const sequence = await applyTextBookmarkCreate(ctx, tx, mutation);
            const result = {
              acknowledged: [mutation.idempotencyKey],
              conflicts: [],
              rejections: [],
              cursor: cursorForSequence(sequence),
            };
            await tx.insert(offlineSyncMutationReceipts).values({
              userId: ctx.user.id,
              idempotencyKey: mutation.idempotencyKey,
              result,
              createdAt: new Date(),
            });
            appliedMutation = mutation;
            return result;
          }

          await assertBookmarkMutationAccess(ctx, tx, mutation);
          const changedFields =
            mutation.kind === "bookmark.update"
              ? Object.keys(mutation.fields)
              : ["tags"];
          const conflicts: ZOfflineSyncConflict[] = [];
          const baseVersions = mutation.baseVersions as Record<string, number>;
          for (const field of changedFields) {
            const [version] = await tx
              .select({ version: offlineSyncFieldVersions.version })
              .from(offlineSyncFieldVersions)
              .where(
                and(
                  eq(offlineSyncFieldVersions.bookmarkId, mutation.bookmarkId),
                  eq(offlineSyncFieldVersions.field, field),
                ),
              );
            const serverVersion = version?.version ?? 0;
            if (baseVersions[field] !== serverVersion) {
              conflicts.push({
                bookmarkId: mutation.bookmarkId,
                field,
                localValue:
                  mutation.kind === "bookmark.update"
                    ? mutation.fields[field as keyof typeof mutation.fields]
                    : mutation.tagIds,
                createdTags:
                  mutation.kind === "bookmark.tags"
                    ? mutation.createdTags
                    : undefined,
                serverValue: await getBookmarkFieldValue(
                  tx,
                  mutation.bookmarkId,
                  field,
                ),
                serverVersion,
              });
            }
          }

          if (conflicts.length > 0) {
            const result = {
              acknowledged: [],
              conflicts,
              rejections: [],
              cursor: await currentCursor(tx, ctx.user.id),
            };
            await tx.insert(offlineSyncMutationReceipts).values({
              userId: ctx.user.id,
              idempotencyKey: mutation.idempotencyKey,
              result,
              createdAt: new Date(),
            });
            return result;
          }

          if (mutation.kind === "bookmark.update") {
            await applyBookmarkUpdate(tx, mutation);
          } else {
            appliedTagDelta = await applyBookmarkTags(
              tx,
              ctx.user.id,
              mutation,
            );
          }
          const [sequence] = await recordOfflineSyncEvents(
            tx,
            ctx.user.id,
            await getOfflineSyncBookmarkRecipientIds(
              ctx,
              tx,
              ctx.user.id,
              mutation.bookmarkId,
            ),
            "bookmark",
            mutation.bookmarkId,
            "update",
            changedFields,
          );
          const result = {
            acknowledged: [mutation.idempotencyKey],
            conflicts: [],
            rejections: [],
            cursor: cursorForSequence(sequence),
          };
          await tx.insert(offlineSyncMutationReceipts).values({
            userId: ctx.user.id,
            idempotencyKey: mutation.idempotencyKey,
            result,
            createdAt: new Date(),
          });
          appliedMutation = mutation;
          return result;
        } catch (error) {
          if (
            error instanceof TRPCError &&
            terminalOfflineSyncErrorCodes.has(error.code)
          ) {
            const result = {
              acknowledged: [],
              conflicts: [],
              rejections: [
                {
                  idempotencyKey: mutation.idempotencyKey,
                  bookmarkId: mutation.bookmarkId,
                  code: error.code as "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND",
                  message: error.message,
                },
              ],
              cursor: await currentCursor(tx, ctx.user.id),
            };
            await tx.insert(offlineSyncMutationReceipts).values({
              userId: ctx.user.id,
              idempotencyKey: mutation.idempotencyKey,
              result,
              createdAt: new Date(),
            });
            return result;
          }
          throw error;
        }
      },
      { behavior: "immediate" },
    );
    if (appliedMutation) {
      if (appliedMutation.kind === "bookmark.create") {
        await triggerTextBookmarkCreateEffects(ctx, appliedMutation);
      } else {
        await triggerBookmarkUpdateEffects(
          ctx,
          appliedMutation,
          appliedTagDelta,
        );
      }
    }
    return result;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to apply offline sync mutations",
      cause: error,
    });
  }
}
