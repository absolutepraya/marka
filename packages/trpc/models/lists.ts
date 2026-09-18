import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import { KarakeepDBTransaction, SqliteError } from "@karakeep/db";
import {
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  listCollaborators,
  ruleEngineRulesTable,
  users,
} from "@karakeep/db/schema";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { ZSortOrder } from "@karakeep/shared/types/bookmarks";
import {
  ZBookmarkList,
  zEditBookmarkListSchemaWithValidation,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";
import { ZCursor } from "@karakeep/shared/types/pagination";
import { zRuleEngineRuleEventSchema } from "@karakeep/shared/types/rules";
import { switchCase } from "@karakeep/shared/utils/switch";

import { AuthedContext, Context } from "..";
import { buildImpersonatingAuthedContext } from "../lib/impersonate";
import { RuleEngine } from "../lib/ruleEngine";
import { getBookmarkIdsFromMatcher } from "../lib/search";
import { Bookmark } from "./bookmarks";
import {
  deleteCollaborationScope,
  getAllSharedListAccess,
  getDirectCollaborationScope,
  getEffectiveCollaboratorGrant,
  getEffectiveCollaboratorsForList,
  setCollaborationScope,
} from "./listCollaborationAccess";
import { invalidateInactiveBookmarkContentEditorGrants } from "./bookmarkContentPermissions";
import { ListInvitation } from "./listInvitations";

interface ListCollaboratorEntry {
  membershipId: string;
}

export abstract class List {
  protected constructor(
    protected ctx: AuthedContext,
    protected list: ZBookmarkList & { userId: string },
  ) {}

  get id() {
    return this.list.id;
  }

  asZBookmarkList(options?: { includeVisibleParent?: boolean }) {
    if (this.list.userId === this.ctx.user.id) {
      return this.list;
    }

    return {
      id: this.list.id,
      name: this.list.name,
      description: this.list.description,
      userId: this.list.userId,
      icon: this.list.icon,
      type: this.list.type,
      query: this.list.query,
      userRole: this.list.userRole,
      hasCollaborators: this.list.hasCollaborators,
      parentId: options?.includeVisibleParent ? this.list.parentId : null,
      public: false,
    };
  }

  private static fromData(
    ctx: AuthedContext,
    data: ZBookmarkList & { userId: string },
    collaboratorEntry: ListCollaboratorEntry | null,
  ) {
    if (data.type === "smart") {
      return new SmartList(ctx, data);
    }
    return new ManualList(ctx, data, collaboratorEntry);
  }

  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<ManualList | SmartList> {
    let list = await (async (): Promise<
      (ZBookmarkList & { userId: string }) | undefined
    > => {
      const l = await ctx.db.query.bookmarkLists.findFirst({
        columns: { rssToken: false },
        where: and(
          eq(bookmarkLists.id, id),
          eq(bookmarkLists.userId, ctx.user.id),
        ),
        with: {
          collaborators: {
            columns: { id: true },
            limit: 1,
          },
        },
      });
      return l
        ? {
            ...l,
            userRole: "owner",
            hasCollaborators: l.collaborators.length > 0,
          }
        : l;
    })();

    let collaboratorEntry: ListCollaboratorEntry | null = null;
    if (!list) {
      const candidate = await ctx.db.query.bookmarkLists.findFirst({
        columns: { rssToken: false },
        where: eq(bookmarkLists.id, id),
      });
      if (candidate) {
        const grant = await getEffectiveCollaboratorGrant(ctx, candidate);
        if (grant) {
          list = {
            ...candidate,
            userRole: grant.role,
            hasCollaborators: true,
          };
          collaboratorEntry = { membershipId: grant.membershipId };
        }
      }
    }

    if (!list) {
      throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
    }
    return this.fromData(ctx, list, collaboratorEntry);
  }

  private static async getPublicList(
    ctx: Context,
    listId: string,
    token: string | null,
  ) {
    const listdb = await ctx.db.query.bookmarkLists.findFirst({
      where: and(
        eq(bookmarkLists.id, listId),
        or(
          eq(bookmarkLists.public, true),
          token !== null ? eq(bookmarkLists.rssToken, token) : undefined,
        ),
      ),
      with: {
        user: { columns: { name: true } },
      },
    });
    if (!listdb) {
      throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
    }
    return listdb;
  }

  static async getPublicListMetadata(
    ctx: Context,
    listId: string,
    token: string | null,
  ) {
    const listdb = await this.getPublicList(ctx, listId, token);
    return {
      userId: listdb.userId,
      name: listdb.name,
      description: listdb.description,
      icon: listdb.icon,
      ownerName: listdb.user.name,
    };
  }

  static async getPublicListContents(
    ctx: Context,
    listId: string,
    token: string | null,
    pagination: {
      limit: number;
      order: Exclude<ZSortOrder, "relevance">;
      cursor: ZCursor | null | undefined;
    },
  ) {
    const listdb = await this.getPublicList(ctx, listId, token);
    const authedCtx = await buildImpersonatingAuthedContext(listdb.userId);
    const listObj = List.fromData(
      authedCtx,
      {
        ...listdb,
        userRole: "public",
        hasCollaborators: false,
      },
      null,
    );
    const bookmarkIds = await listObj.getBookmarkIds();
    const list = listObj.asZBookmarkList();
    const bookmarks = await Bookmark.loadMulti(authedCtx, {
      ids: bookmarkIds,
      includeContent: false,
      limit: pagination.limit,
      sortOrder: pagination.order,
      cursor: pagination.cursor,
    });

    return {
      list: {
        icon: list.icon,
        name: list.name,
        description: list.description,
        ownerName: listdb.user.name,
        numItems: bookmarkIds.length,
      },
      bookmarks: bookmarks.bookmarks.map((b) => b.asPublicBookmark()),
      nextCursor: bookmarks.nextCursor,
    };
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewBookmarkListSchema>,
  ): Promise<ManualList | SmartList> {
    const [result] = await ctx.db
      .insert(bookmarkLists)
      .values({
        name: input.name,
        description: input.description,
        icon: input.icon,
        userId: ctx.user.id,
        parentId: input.parentId,
        type: input.type,
        query: input.query,
      })
      .returning();
    return this.fromData(
      ctx,
      {
        ...result,
        userRole: "owner",
        hasCollaborators: false,
      },
      null,
    );
  }

  static async getAll(ctx: AuthedContext) {
    const [ownedLists, sharedLists] = await Promise.all([
      this.getAllOwned(ctx),
      this.getSharedWithUser(ctx),
    ]);
    return [...ownedLists, ...sharedLists];
  }

  static async getAllOwned(
    ctx: AuthedContext,
  ): Promise<(ManualList | SmartList)[]> {
    const lists = await ctx.db.query.bookmarkLists.findMany({
      columns: { rssToken: false },
      where: and(eq(bookmarkLists.userId, ctx.user.id)),
      with: {
        collaborators: {
          columns: { id: true },
          limit: 1,
        },
      },
    });
    return lists.map((l) =>
      this.fromData(
        ctx,
        {
          ...l,
          userRole: "owner",
          hasCollaborators: l.collaborators.length > 0,
        },
        null,
      ),
    );
  }

  static async forBookmark(ctx: AuthedContext, bookmarkId: string) {
    const lists = await ctx.db.query.bookmarksInLists.findMany({
      where: eq(bookmarksInLists.bookmarkId, bookmarkId),
      with: {
        list: { columns: { rssToken: false } },
      },
    });

    const ownerListIds = lists
      .filter((l) => l.list.userId === ctx.user.id)
      .map((l) => l.list.id);
    const listsWithCollaborators = new Set<string>();
    if (ownerListIds.length > 0) {
      const collaborators = await ctx.db.query.listCollaborators.findMany({
        where: inArray(listCollaborators.listId, ownerListIds),
        columns: { listId: true },
      });
      collaborators.forEach((c) => listsWithCollaborators.add(c.listId));
    }

    const resolved = await Promise.all(
      lists.map(async (l) => {
        if (l.list.userId === ctx.user.id) {
          return this.fromData(
            ctx,
            {
              ...l.list,
              userRole: "owner",
              hasCollaborators: listsWithCollaborators.has(l.list.id),
            },
            null,
          );
        }
        const grant = await getEffectiveCollaboratorGrant(ctx, l.list);
        if (!grant) return null;
        return this.fromData(
          ctx,
          {
            ...l.list,
            userRole: grant.role,
            hasCollaborators: true,
          },
          { membershipId: grant.membershipId },
        );
      }),
    );
    return resolved.filter(
      (list): list is ManualList | SmartList => list !== null,
    );
  }

  canUserView(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: true,
      viewer: true,
      public: true,
    });
  }

  canUserEdit(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: true,
      viewer: false,
      public: false,
    });
  }

  canUserManage(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: false,
      viewer: false,
      public: false,
    });
  }

  ensureCanView(): void {
    if (!this.canUserView()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to view this list",
      });
    }
  }

  ensureCanEdit(): void {
    if (!this.canUserEdit()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to edit this list",
      });
    }
  }

  ensureCanManage(): void {
    if (!this.canUserManage()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to manage this list",
      });
    }
  }

  protected async cleanupRulesAfterListDeletion(tx: KarakeepDBTransaction) {
    const rules = await tx
      .select({
        id: ruleEngineRulesTable.id,
        event: ruleEngineRulesTable.event,
      })
      .from(ruleEngineRulesTable)
      .where(
        and(
          eq(ruleEngineRulesTable.userId, this.ctx.user.id),
          sql`json_valid(${ruleEngineRulesTable.event})`,
          sql`json_extract(${ruleEngineRulesTable.event}, '$.type') IN ('addedToList', 'removedFromList')`,
          sql`EXISTS (
            SELECT 1
            FROM json_each(json_extract(${ruleEngineRulesTable.event}, '$.listIds'))
            WHERE value = ${this.list.id}
          )`,
        ),
      );
    const rulesToDelete: string[] = [];
    const rulesToUpdate: { id: string; event: string }[] = [];

    for (const rule of rules) {
      let parsedEvent: unknown;
      try {
        parsedEvent = JSON.parse(rule.event);
      } catch {
        console.error(`Failed to parse event JSON for rule ${rule.id}`);
        continue;
      }
      const ruleEvent = zRuleEngineRuleEventSchema.safeParse(parsedEvent);
      if (!ruleEvent.success) {
        console.error(`Failed to validate event schema for rule ${rule.id}`);
        continue;
      }
      const ruleEventData = ruleEvent.data;
      if (
        ruleEventData.type === "addedToList" ||
        ruleEventData.type === "removedFromList"
      ) {
        const filtered = ruleEventData.listIds.filter(
          (id: string) => id !== this.list.id,
        );
        if (filtered.length === 0) {
          rulesToDelete.push(rule.id);
        } else {
          rulesToUpdate.push({
            id: rule.id,
            event: JSON.stringify({ ...ruleEventData, listIds: filtered }),
          });
        }
      }
    }

    if (rulesToDelete.length > 0) {
      await tx
        .delete(ruleEngineRulesTable)
        .where(inArray(ruleEngineRulesTable.id, rulesToDelete));
    }
    if (rulesToUpdate.length > 0) {
      await Promise.all(
        rulesToUpdate.map(({ id, event }) =>
          tx
            .update(ruleEngineRulesTable)
            .set({ event })
            .where(eq(ruleEngineRulesTable.id, id)),
        ),
      );
    }
  }

  async delete() {
    this.ensureCanManage();
    await this.ctx.db.transaction(async (tx) => {
      const res = await tx
        .delete(bookmarkLists)
        .where(
          and(
            eq(bookmarkLists.id, this.list.id),
            eq(bookmarkLists.userId, this.ctx.user.id),
          ),
        );
      if (res.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await this.cleanupRulesAfterListDeletion(tx);
    });
  }

  async getChildren(): Promise<(ManualList | SmartList)[]> {
    const lists = await List.getAllOwned(this.ctx);
    const listById = new Map(lists.map((l) => [l.id, l]));
    const adjacencyList = new Map<string, string[]>();
    lists.forEach((l) => adjacencyList.set(l.id, []));
    lists.forEach((l) => {
      const parentId = l.asZBookmarkList().parentId;
      if (parentId) {
        const currentChildren = adjacencyList.get(parentId) ?? [];
        currentChildren.push(l.id);
        adjacencyList.set(parentId, currentChildren);
      }
    });

    const resultIds: string[] = [];
    const queue: string[] = [this.list.id];
    const visited = new Set<string>([this.list.id]);
    while (queue.length > 0) {
      const id = queue.pop()!;
      const children = adjacencyList.get(id) ?? [];
      children.forEach((childId) => {
        if (visited.has(childId)) return;
        visited.add(childId);
        queue.push(childId);
        resultIds.push(childId);
      });
    }
    return resultIds.map((id) => listById.get(id)!);
  }

  async update(
    input: z.infer<typeof zEditBookmarkListSchemaWithValidation>,
  ): Promise<void> {
    this.ensureCanManage();
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === this.list.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A list cannot be its own parent",
        });
      }
      const descendants = await this.getChildren();
      if (descendants.some((descendant) => descendant.id === input.parentId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A list cannot be moved inside one of its descendants",
        });
      }
    }
    const result = await this.ctx.db
      .update(bookmarkLists)
      .set({
        name: input.name,
        description: input.description,
        icon: input.icon,
        parentId: input.parentId,
        query: input.query,
        public: input.public,
      })
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();
    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    invariant(result[0].userId === this.ctx.user.id);
    const collaboratorsCount =
      await this.ctx.db.query.listCollaborators.findMany({
        where: eq(listCollaborators.listId, this.list.id),
        columns: { id: true },
        limit: 1,
      });
    this.list = {
      ...result[0],
      userRole: "owner",
      hasCollaborators: collaboratorsCount.length > 0,
    };
  }

  private async setRssToken(token: string | null) {
    const result = await this.ctx.db
      .update(bookmarkLists)
      .set({ rssToken: token })
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();
    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return result[0].rssToken;
  }

  async getRssToken(): Promise<string | null> {
    this.ensureCanManage();
    const [result] = await this.ctx.db
      .select({ rssToken: bookmarkLists.rssToken })
      .from(bookmarkLists)
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .limit(1);
    return result.rssToken ?? null;
  }

  async regenRssToken() {
    this.ensureCanManage();
    return this.setRssToken(crypto.randomBytes(32).toString("hex"));
  }

  async clearRssToken() {
    this.ensureCanManage();
    await this.setRssToken(null);
  }

  async addCollaboratorByEmail(
    email: string,
    role: "viewer" | "editor",
    recursive = false,
  ): Promise<string> {
    this.ensureCanManage();
    return ListInvitation.inviteByEmail(this.ctx, {
      email,
      role,
      recursive,
      listId: this.list.id,
      listName: this.list.name,
      listType: this.list.type,
      listOwnerId: this.list.userId,
      inviterUserId: this.ctx.user.id,
      inviterName: this.ctx.user.name ?? null,
    });
  }

  async removeCollaborator(userId: string): Promise<void> {
    this.ensureCanManage();
    const result = await this.ctx.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, this.list.id),
          eq(listCollaborators.userId, userId),
        ),
      );
    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Collaborator not found",
      });
    }
    await deleteCollaborationScope(this.ctx, {
      listId: this.list.id,
      userId,
    });
  }

  async leaveList(): Promise<void> {
    if (this.list.userRole === "owner") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "List owners cannot leave their own list. Delete the list instead.",
      });
    }

    const grant = await getEffectiveCollaboratorGrant(this.ctx, this.list);
    if (!grant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Collaborator not found",
      });
    }
    const result = await this.ctx.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.id, grant.membershipId),
          eq(listCollaborators.userId, this.ctx.user.id),
        ),
      );
    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Collaborator not found",
      });
    }
    await deleteCollaborationScope(this.ctx, {
      listId: grant.sourceListId,
      userId: this.ctx.user.id,
    });
  }

  async updateCollaborator(
    userId: string,
    role: "viewer" | "editor",
    recursive: boolean,
  ): Promise<void> {
    this.ensureCanManage();
    const result = await this.ctx.db
      .update(listCollaborators)
      .set({ role })
      .where(
        and(
          eq(listCollaborators.listId, this.list.id),
          eq(listCollaborators.userId, userId),
        ),
      );
    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Collaborator not found",
      });
    }
    await setCollaborationScope(this.ctx, {
      listId: this.list.id,
      userId,
      recursive,
    });
  }

  async updateCollaboratorRole(
    userId: string,
    role: "viewer" | "editor",
  ): Promise<void> {
    const recursive = await getDirectCollaborationScope(this.ctx, {
      listId: this.list.id,
      userId,
    });
    await this.updateCollaborator(userId, role, recursive);
  }

  async getCollaborators() {
    this.ensureCanView();
    const isOwner = this.list.userId === this.ctx.user.id;
    const [collaborators, invitations] = await Promise.all([
      getEffectiveCollaboratorsForList(this.ctx, this.list),
      isOwner
        ? ListInvitation.invitationsForList(this.ctx, { listId: this.list.id })
        : [],
    ]);
    const owner = await this.ctx.db.query.users.findFirst({
      where: eq(users.id, this.list.userId),
      columns: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
    const collaboratorEntries = collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      role: c.role,
      recursive: c.recursive,
      inherited: c.inherited,
      sourceListId: isOwner ? c.sourceListId : undefined,
      sourceListName: isOwner ? c.sourceListName : null,
      status: "accepted" as const,
      addedAt: c.addedAt,
      invitedAt: c.addedAt,
      user: {
        id: c.user.id,
        name: c.user.name,
        email: isOwner ? c.user.email : null,
        image: c.user.image,
      },
    }));
    return {
      collaborators: [...collaboratorEntries, ...invitations],
      owner: owner
        ? {
            id: owner.id,
            name: owner.name,
            email: isOwner ? owner.email : null,
            image: owner.image,
          }
        : null,
    };
  }

  static async getSharedWithUser(
    ctx: AuthedContext,
  ): Promise<(ManualList | SmartList)[]> {
    const collaborations = await getAllSharedListAccess(ctx);
    return collaborations.map(({ list, grant }) =>
      this.fromData(
        ctx,
        {
          ...list,
          userRole: grant.role,
          hasCollaborators: true,
        },
        { membershipId: grant.membershipId },
      ),
    );
  }

  abstract get type(): "manual" | "smart";
  abstract getBookmarkIds(visitedListIds?: Set<string>): Promise<string[]>;
  abstract getSize(): Promise<number>;
  abstract addBookmark(bookmarkId: string): Promise<void>;
  abstract removeBookmark(bookmarkId: string): Promise<void>;
  abstract mergeInto(
    targetList: List,
    deleteSourceAfterMerge: boolean,
  ): Promise<void>;
}

export class SmartList extends List {
  private static readonly MAX_VISITED_LISTS = 30;
  parsedQuery: ReturnType<typeof parseSearchQuery> | null = null;

  constructor(ctx: AuthedContext, list: ZBookmarkList & { userId: string }) {
    super(ctx, list);
  }

  get type(): "smart" {
    invariant(this.list.type === "smart");
    return this.list.type;
  }

  get query() {
    invariant(this.list.query);
    return this.list.query;
  }

  getParsedQuery() {
    if (!this.parsedQuery) {
      const result = parseSearchQuery(this.query);
      if (result.result !== "full") {
        throw new Error("Invalid smart list query");
      }
      this.parsedQuery = result;
    }
    return this.parsedQuery;
  }

  async getBookmarkIds(visitedListIds = new Set<string>()): Promise<string[]> {
    if (visitedListIds.size >= SmartList.MAX_VISITED_LISTS) return [];
    if (visitedListIds.has(this.list.id)) return [];
    const newVisitedListIds = new Set(visitedListIds);
    newVisitedListIds.add(this.list.id);
    const parsedQuery = this.getParsedQuery();
    if (!parsedQuery.matcher) return [];
    return getBookmarkIdsFromMatcher(
      this.ctx,
      parsedQuery.matcher,
      newVisitedListIds,
    );
  }

  async getSize(): Promise<number> {
    return this.getBookmarkIds().then((ids) => ids.length);
  }

  addBookmark(_bookmarkId: string): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be added to",
    });
  }

  removeBookmark(_bookmarkId: string): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be removed from",
    });
  }

  mergeInto(
    _targetList: List,
    _deleteSourceAfterMerge: boolean,
  ): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be merged",
    });
  }
}

export class ManualList extends List {
  constructor(
    ctx: AuthedContext,
    list: ZBookmarkList & { userId: string },
    private collaboratorEntry: ListCollaboratorEntry | null,
  ) {
    super(ctx, list);
  }

  get type(): "manual" {
    invariant(this.list.type === "manual");
    return this.list.type;
  }

  async getBookmarkIds(_visitedListIds?: Set<string>): Promise<string[]> {
    const results = await this.ctx.db
      .select({ id: bookmarksInLists.bookmarkId })
      .from(bookmarksInLists)
      .where(eq(bookmarksInLists.listId, this.list.id));
    return results.map((r) => r.id);
  }

  async getSize(): Promise<number> {
    const results = await this.ctx.db
      .select({ count: count() })
      .from(bookmarksInLists)
      .where(eq(bookmarksInLists.listId, this.list.id));
    return results[0].count;
  }

  async addBookmark(bookmarkId: string): Promise<void> {
    this.ensureCanEdit();
    try {
      await this.ctx.db.insert(bookmarksInLists).values({
        listId: this.list.id,
        bookmarkId,
        listMembershipId: this.collaboratorEntry?.membershipId,
      });
      const bookmark = await this.ctx.db.query.bookmarks.findFirst({
        where: eq(bookmarks.id, bookmarkId),
        columns: { userId: true },
      });
      if (bookmark) {
        await RuleEngine.triggerOnEvent(
          bookmark.userId,
          bookmarkId,
          [{ type: "addedToList", listId: this.list.id }],
          undefined,
          this.ctx.db,
        );
      }
    } catch (e) {
      if (
        e instanceof SqliteError &&
        e.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
      ) {
        return;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    }
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    this.ensureCanEdit();
    const deleted = await this.ctx.db
      .delete(bookmarksInLists)
      .where(
        and(
          eq(bookmarksInLists.listId, this.list.id),
          eq(bookmarksInLists.bookmarkId, bookmarkId),
        ),
      );
    if (deleted.changes === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Bookmark ${bookmarkId} is already not in list ${this.list.id}`,
      });
    }
    await invalidateInactiveBookmarkContentEditorGrants(this.ctx, bookmarkId);
    const bookmark = await this.ctx.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
      columns: { userId: true },
    });
    if (bookmark) {
      await RuleEngine.triggerOnEvent(
        bookmark.userId,
        bookmarkId,
        [{ type: "removedFromList", listId: this.list.id }],
        undefined,
        this.ctx.db,
      );
    }
  }

  async update(input: z.infer<typeof zEditBookmarkListSchemaWithValidation>) {
    if (input.query) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Manual lists cannot have a query",
      });
    }
    return super.update(input);
  }

  async mergeInto(
    targetList: List,
    deleteSourceAfterMerge: boolean,
  ): Promise<void> {
    this.ensureCanManage();
    targetList.ensureCanManage();
    if (targetList.type !== "manual") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You can only merge into a manual list",
      });
    }
    const bookmarkIds = await this.getBookmarkIds();
    await this.ctx.db.transaction(async (tx) => {
      await tx
        .insert(bookmarksInLists)
        .values(
          bookmarkIds.map((id) => ({ bookmarkId: id, listId: targetList.id })),
        )
        .onConflictDoNothing();
      if (deleteSourceAfterMerge) {
        await tx
          .delete(bookmarkLists)
          .where(eq(bookmarkLists.id, this.list.id));
        await this.cleanupRulesAfterListDeletion(tx);
      }
    });
  }
}
