import { beforeEach, describe, expect, test } from "vitest";

import { eq } from "drizzle-orm";

import { bookmarks, rssFeedImportsTable } from "@karakeep/db/schema";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  zOfflineSyncPullInputSchema,
  zOfflineSyncPushInputSchema,
} from "@karakeep/shared/types/offlineSync";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("offline sync contracts", () => {
  test("accepts a field-versioned bookmark update", () => {
    expect(
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "0a42a35d-afe8-4b34-91ba-1ca4767c1fe0",
            bookmarkId: "bookmark-1",
            kind: "bookmark.update",
            fields: { title: "Read later" },
            baseVersions: { title: 7 },
          },
        ],
      }).mutations[0].kind,
    ).toBe("bookmark.update");
  });

  test("accepts exactly one mutation per push", () => {
    const mutation = {
      idempotencyKey: "0a42a35d-afe8-4b34-91ba-1ca4767c1fe0",
      bookmarkId: "bookmark-1",
      kind: "bookmark.update" as const,
      fields: { title: "Read later" },
      baseVersions: { title: 7 },
    };
    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          mutation,
          {
            ...mutation,
            idempotencyKey: "2d068a43-97e4-4417-9ca3-202fd12415d5",
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects uploads and destructive operations", () => {
    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [{ idempotencyKey: "x", kind: "bookmark.delete" }],
      }),
    ).toThrow();
  });
  test("accepts a versioned bookmark tag update", () => {
    expect(
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "2d068a43-97e4-4417-9ca3-202fd12415d5",
            bookmarkId: "bookmark-1",
            kind: "bookmark.tags",
            tagIds: ["tag-1"],
            createdTags: [],
            baseVersions: { tags: 3 },
          },
        ],
      }).mutations[0].kind,
    ).toBe("bookmark.tags");
  });

  test("accepts an offline text bookmark creation", () => {
    expect(
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "a212978b-b60a-4e3c-bb64-dbe16d811285",
            kind: "bookmark.create",
            bookmarkId: "f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7",
            bookmark: {
              type: BookmarkTypes.TEXT,
              text: "Offline note",
              createdAt: "2026-08-02T00:00:00Z",
            },
          },
        ],
      }).mutations[0].kind,
    ).toBe("bookmark.create");
  });

  test("accepts explicit bookmark list membership intent", () => {
    expect(
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "3a24cef3-06a8-4e17-a417-b08cc78ccb3a",
            bookmarkId: "bookmark-1",
            kind: "bookmark.listMembership",
            listId: "list-1",
            action: "add",
          },
        ],
      }).mutations[0].kind,
    ).toBe("bookmark.listMembership");
  });

  test("accepts an idempotent bookmark deletion intent", () => {
    expect(
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "3846fd1e-7d76-4f60-b1f9-cdff16936710",
            bookmarkId: "bookmark-1",
            kind: "bookmark.delete",
          },
        ],
      }).mutations[0].kind,
    ).toBe("bookmark.delete");
  });

  test("rejects an update without changed fields", () => {
    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "e6fa59f6-f45d-43a0-9284-08f6c245e07e",
            bookmarkId: "bookmark-1",
            kind: "bookmark.update",
            fields: {},
            baseVersions: {},
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects invalid idempotency keys and cursors", () => {
    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [
          {
            idempotencyKey: "not-a-uuid",
            bookmarkId: "bookmark-1",
            kind: "bookmark.tags",
            tagIds: [],
            createdTags: [],
            baseVersions: { tags: 0 },
          },
        ],
      }),
    ).toThrow();
    expect(() => zOfflineSyncPullInputSchema.parse({ cursor: "-1" })).toThrow();
  });

  test("requires base versions for exactly the changed bookmark fields", () => {
    const mutation = {
      idempotencyKey: "4e50ebfa-8859-48d5-b9a4-dfe8324b85ae",
      bookmarkId: "bookmark-1",
      kind: "bookmark.update" as const,
      fields: { title: "Read later" },
    };

    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [{ ...mutation, baseVersions: {} }],
      }),
    ).toThrow();
    expect(() =>
      zOfflineSyncPushInputSchema.parse({
        mutations: [{ ...mutation, baseVersions: { title: 7, note: 2 } }],
      }),
    ).toThrow();
  });
});

describe("Offline sync routes", () => {
  test<CustomTestContext>("records a permanent authorization rejection as an idempotent result", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const other = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "owner only",
    });
    const mutation = {
      idempotencyKey: "5c299d95-e67e-4a1a-af14-e3c275d2fbf8",
      kind: "bookmark.update" as const,
      bookmarkId: bookmark.id,
      fields: { title: "Offline edit" },
      baseVersions: { title: 0 },
    };

    const first = await other.offlineSync.push({ mutations: [mutation] });
    const replay = await other.offlineSync.push({ mutations: [mutation] });

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      acknowledged: [],
      conflicts: [],
      rejections: [
        {
          idempotencyKey: mutation.idempotencyKey,
          bookmarkId: bookmark.id,
          code: "FORBIDDEN",
        },
      ],
    });
  });

  test<CustomTestContext>("allows a granted content editor to sync text but not metadata", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const collaboratorUser = await collaborator.users.whoami();
    const list = await owner.lists.create({
      name: "Offline shared writing",
      icon: "folder",
      type: "manual",
    });
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Before offline edit",
    });
    await owner.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    const { invitationId } = await owner.lists.addCollaborator({
      listId: list.id,
      email: collaboratorUser.email!,
      role: "viewer",
    });
    await collaborator.lists.acceptInvitation({ invitationId });
    await owner.bookmarks.grantContentEditor({
      bookmarkId: bookmark.id,
      userId: collaboratorUser.id,
    });

    const permissions = await collaborator.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    const ownerBeforeEdit = await owner.offlineSync.snapshot();
    const textMutation = {
      idempotencyKey: "18faab3e-9ccf-41ea-bd70-0b9aa4c31d88",
      kind: "bookmark.update" as const,
      bookmarkId: bookmark.id,
      fields: { text: "After offline edit" },
      baseVersions: { text: permissions.textVersion },
    };
    const textResult = await collaborator.offlineSync.push({
      mutations: [textMutation],
    });
    expect(textResult.acknowledged).toEqual([textMutation.idempotencyKey]);

    const saved = await owner.bookmarks.getBookmark({
      bookmarkId: bookmark.id,
    });
    expect(saved.content).toMatchObject({
      type: BookmarkTypes.TEXT,
      text: "After offline edit",
    });
    const ownerDelta = await owner.offlineSync.pull({
      cursor: ownerBeforeEdit.cursor,
    });
    expect(ownerDelta.events).toContainEqual(
      expect.objectContaining({
        entityId: bookmark.id,
        changedFields: ["text"],
      }),
    );

    const metadataMutation = {
      idempotencyKey: "9adbc0b3-54f7-4306-a1f8-a54af7f7b76a",
      kind: "bookmark.update" as const,
      bookmarkId: bookmark.id,
      fields: { title: "Not allowed offline" },
      baseVersions: { title: 0 },
    };
    const metadataResult = await collaborator.offlineSync.push({
      mutations: [metadataMutation],
    });
    expect(metadataResult.rejections).toEqual([
      expect.objectContaining({
        idempotencyKey: metadataMutation.idempotencyKey,
        bookmarkId: bookmark.id,
        code: "FORBIDDEN",
      }),
    ]);
  });

  test<CustomTestContext>("replays existing-list membership intent idempotently", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "offline list member",
    });
    const list = await owner.lists.create({
      name: "Offline list",
      icon: "folder",
      type: "manual",
    });
    const add = {
      idempotencyKey: "c4d4d33e-05e8-4404-aaac-ad1eb0f6c4e4",
      kind: "bookmark.listMembership" as const,
      bookmarkId: bookmark.id,
      listId: list.id,
      action: "add" as const,
    };

    const firstAdd = await owner.offlineSync.push({ mutations: [add] });
    const replayedAdd = await owner.offlineSync.push({ mutations: [add] });
    const afterAdd = await owner.offlineSync.snapshot();

    expect(firstAdd).toEqual(replayedAdd);
    expect(firstAdd.acknowledged).toEqual([add.idempotencyKey]);
    expect(afterAdd.bookmarkListMemberships).toContainEqual({
      bookmarkId: bookmark.id,
      listId: list.id,
    });

    const remove = {
      idempotencyKey: "9836e1de-876b-46d3-8e78-05d251326318",
      kind: "bookmark.listMembership" as const,
      bookmarkId: bookmark.id,
      listId: list.id,
      action: "remove" as const,
    };
    await owner.offlineSync.push({ mutations: [remove] });
    const afterRemove = await owner.offlineSync.snapshot();

    expect(afterRemove.bookmarkListMemberships).not.toContainEqual({
      bookmarkId: bookmark.id,
      listId: list.id,
    });
  });

  test<CustomTestContext>("replays an offline bookmark deletion idempotently", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "delete offline",
    });
    const mutation = {
      idempotencyKey: "645e5ca2-0c06-4af3-a3a3-eeb369fe5e9c",
      kind: "bookmark.delete" as const,
      bookmarkId: bookmark.id,
    };

    const first = await owner.offlineSync.push({ mutations: [mutation] });
    const replay = await owner.offlineSync.push({ mutations: [mutation] });
    const snapshot = await owner.offlineSync.snapshot();

    expect(first).toEqual(replay);
    expect(first.acknowledged).toEqual([mutation.idempotencyKey]);
    expect(snapshot.bookmarks.map((item) => item.id)).not.toContain(
      bookmark.id,
    );
  });

  test<CustomTestContext>("creates and attaches an offline-created tag with its client ID", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "new offline tag",
    });
    const mutation = {
      idempotencyKey: "f5b0f41a-b064-4faf-b528-b0e9cae41052",
      kind: "bookmark.tags" as const,
      bookmarkId: bookmark.id,
      tagIds: ["f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7"],
      createdTags: [
        {
          id: "f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7",
          name: "Offline tag",
        },
      ],
      baseVersions: { tags: 0 },
    };

    const first = await owner.offlineSync.push({ mutations: [mutation] });
    const replay = await owner.offlineSync.push({ mutations: [mutation] });
    const snapshot = await owner.offlineSync.snapshot();

    expect(first).toEqual(replay);
    expect(snapshot.bookmarks).toContainEqual(
      expect.objectContaining({
        id: bookmark.id,
        tags: [
          expect.objectContaining({
            id: mutation.createdTags[0].id,
            name: "Offline tag",
          }),
        ],
      }),
    );
  });

  test<CustomTestContext>("creates a text bookmark with its client ID while offline", async ({
    apiCallers,
    db,
  }) => {
    const owner = apiCallers[0];
    const mutation = {
      idempotencyKey: "a212978b-b60a-4e3c-bb64-dbe16d811285",
      kind: "bookmark.create" as const,
      bookmarkId: "f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7",
      bookmark: {
        type: BookmarkTypes.TEXT as BookmarkTypes.TEXT,
        text: "Offline note",
        title: "Saved offline",
        createdAt: new Date("2026-08-02T00:00:00Z"),
      },
    };

    const first = await owner.offlineSync.push({ mutations: [mutation] });
    const replay = await owner.offlineSync.push({ mutations: [mutation] });
    const snapshot = await owner.offlineSync.snapshot();

    expect(first).toEqual(replay);
    expect(snapshot.bookmarks).toContainEqual(
      expect.objectContaining({
        id: mutation.bookmarkId,
        title: "Saved offline",
        content: expect.objectContaining({
          type: BookmarkTypes.TEXT,
          text: "Offline note",
        }),
      }),
    );
    const storedBookmark = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, mutation.bookmarkId),
      columns: { summaryProvenance: true },
    });
    expect(storedBookmark?.summaryProvenance).toBeNull();
  });

  test<CustomTestContext>("rejects offline list membership after edit access is revoked", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const list = await owner.lists.create({
      name: "Shared offline list",
      icon: "folder",
      type: "manual",
    });
    const collaboratorUser = await collaborator.users.whoami();
    const { invitationId } = await owner.lists.addCollaborator({
      listId: list.id,
      email: collaboratorUser.email!,
      role: "viewer",
    });
    await collaborator.lists.acceptInvitation({ invitationId });
    const bookmark = await collaborator.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "viewer bookmark",
    });
    const mutation = {
      idempotencyKey: "bba7c3c6-e3b9-4e1a-a165-1ca76cc052a5",
      kind: "bookmark.listMembership" as const,
      bookmarkId: bookmark.id,
      listId: list.id,
      action: "add" as const,
    };

    const result = await collaborator.offlineSync.push({
      mutations: [mutation],
    });

    expect(result.rejections).toEqual([
      expect.objectContaining({
        idempotencyKey: mutation.idempotencyKey,
        bookmarkId: bookmark.id,
        code: "FORBIDDEN",
      }),
    ]);
  });

  test<CustomTestContext>("pull returns only the caller's events after its cursor", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const other = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "offline library record",
    });
    const privateBookmark = await other.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "private",
    });

    const snapshot = await owner.offlineSync.snapshot();
    const delta = await owner.offlineSync.pull({ cursor: snapshot.cursor });

    expect(snapshot.bookmarks.map((item) => item.id)).toContain(bookmark.id);
    expect(snapshot.bookmarks.map((item) => item.id)).not.toContain(
      privateBookmark.id,
    );
    expect(delta.events).toEqual([]);
  });

  test<CustomTestContext>("scopes snapshot memberships to accessible lists", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const other = apiCallers[1];
    const ownerBookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "owned membership",
    });
    const otherBookmark = await other.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "foreign membership",
    });
    const ownerList = await owner.lists.create({
      name: "Owner list",
      icon: "folder",
      type: "manual",
    });
    const otherList = await other.lists.create({
      name: "Other list",
      icon: "folder",
      type: "manual",
    });
    await owner.lists.addToList({
      listId: ownerList.id,
      bookmarkId: ownerBookmark.id,
    });
    await other.lists.addToList({
      listId: otherList.id,
      bookmarkId: otherBookmark.id,
    });

    const snapshot = await owner.offlineSync.snapshot();

    expect(snapshot.bookmarkListMemberships).toContainEqual({
      bookmarkId: ownerBookmark.id,
      listId: ownerList.id,
    });
    expect(snapshot.bookmarkListMemberships).not.toContainEqual({
      bookmarkId: otherBookmark.id,
      listId: otherList.id,
    });
  });

  test<CustomTestContext>("replicates RSS feed memberships for the owner's bookmarks", async ({
    apiCallers,
    db,
  }) => {
    const owner = apiCallers[0];
    const rssBookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/rss-entry",
    });
    const feed = await owner.feeds.create({
      name: "Offline feed",
      url: "https://example.com/feed.xml",
      enabled: true,
    });
    await db.insert(rssFeedImportsTable).values({
      rssFeedId: feed.id,
      entryId: "entry-1",
      bookmarkId: rssBookmark.id,
    });

    const snapshot = await owner.offlineSync.snapshot();

    expect(snapshot.bookmarkRssFeedMemberships).toContainEqual({
      bookmarkId: rssBookmark.id,
      rssFeedId: feed.id,
    });
  });

  test<CustomTestContext>("returns only ordered caller deltas after a cursor", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const other = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "owner record",
    });
    const snapshot = await owner.offlineSync.snapshot();
    await owner.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      title: "first owner delta",
    });
    const foreignBookmark = await other.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "foreign private record",
    });
    const secondOwnerBookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "second owner delta",
    });
    const foreignList = await other.lists.create({
      name: "foreign private list",
      icon: "folder",
      type: "manual",
    });

    const delta = await owner.offlineSync.pull({ cursor: snapshot.cursor });

    expect(delta.events).toHaveLength(2);
    expect(delta.events.map((event) => event.sequence)).toEqual(
      delta.events.map((event) => event.sequence).sort((a, b) => a - b),
    );
    expect(delta.events.map((event) => event.entityId)).toEqual([
      bookmark.id,
      secondOwnerBookmark.id,
    ]);
    expect(delta.events.map((event) => event.entityId)).not.toContain(
      foreignBookmark.id,
    );
    expect(snapshot.bookmarks.map((item) => item.id)).not.toContain(
      foreignBookmark.id,
    );
    expect(snapshot.lists.map((item) => item.id)).not.toContain(foreignList.id);
    expect(
      JSON.stringify({ snapshot, delta }).includes(foreignBookmark.id),
    ).toBe(false);
  });

  test<CustomTestContext>("returns only authorized current field versions in snapshots and deltas", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const other = apiCallers[1];
    const ownerBookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "owned version",
    });
    const otherBookmark = await other.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "foreign version",
    });
    await owner.bookmarks.updateBookmark({
      bookmarkId: ownerBookmark.id,
      title: "owned title v1",
    });
    await other.bookmarks.updateBookmark({
      bookmarkId: otherBookmark.id,
      title: "foreign title v1",
    });

    const snapshot = await owner.offlineSync.snapshot();
    expect(snapshot.bookmarkFieldVersions).toContainEqual({
      bookmarkId: ownerBookmark.id,
      field: "title",
      version: 1,
    });
    expect(snapshot.bookmarkFieldVersions).not.toContainEqual(
      expect.objectContaining({ bookmarkId: otherBookmark.id }),
    );

    await owner.bookmarks.updateBookmark({
      bookmarkId: ownerBookmark.id,
      note: "owned note v1",
    });
    const delta = await owner.offlineSync.pull({ cursor: snapshot.cursor });

    expect(delta.events).toContainEqual(
      expect.objectContaining({
        entityId: ownerBookmark.id,
        changedFields: ["note"],
        fieldVersions: [
          { bookmarkId: ownerBookmark.id, field: "note", version: 1 },
        ],
      }),
    );
  });

  test<CustomTestContext>("replays mutations and merges independent fields while rejecting stale fields", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "offline library record",
    });
    const titleMutation = {
      idempotencyKey: "4b687efc-6212-4c34-b758-e72338ef8c4e",
      kind: "bookmark.update" as const,
      bookmarkId: bookmark.id,
      fields: { title: "from phone" },
      baseVersions: { title: 0 },
    };

    const first = await api.offlineSync.push({ mutations: [titleMutation] });
    const replay = await api.offlineSync.push({ mutations: [titleMutation] });
    const independentField = await api.offlineSync.push({
      mutations: [
        {
          idempotencyKey: "bd6b94d7-2fc1-4100-bf5a-f866c40bfbdc",
          kind: "bookmark.update",
          bookmarkId: bookmark.id,
          fields: { note: "merged note" },
          baseVersions: { note: 0 },
        },
      ],
    });
    const conflict = await api.offlineSync.push({
      mutations: [
        {
          idempotencyKey: "7d3ced67-588d-4a40-a00a-8c4902d500c0",
          kind: "bookmark.update",
          bookmarkId: bookmark.id,
          fields: { title: "stale title" },
          baseVersions: { title: 0 },
        },
      ],
    });

    expect(replay).toEqual(first);
    expect(independentField.acknowledged).toHaveLength(1);
    expect(conflict.conflicts).toEqual([
      expect.objectContaining({
        bookmarkId: bookmark.id,
        field: "title",
        localValue: "stale title",
        serverValue: "from phone",
        serverVersion: 1,
      }),
    ]);
  });

  test<CustomTestContext>("rejects a stale tag set as one field", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "offline library record",
    });
    const tag = await api.tags.create({ name: "travel" });

    await api.offlineSync.push({
      mutations: [
        {
          idempotencyKey: "f3ad6f4a-e2d5-4435-baab-f4c48a841c99",
          kind: "bookmark.tags",
          bookmarkId: bookmark.id,
          tagIds: [tag.id],
          createdTags: [],
          baseVersions: { tags: 0 },
        },
      ],
    });
    const conflict = await api.offlineSync.push({
      mutations: [
        {
          idempotencyKey: "133b4960-ed90-4825-a918-861f7420e93a",
          kind: "bookmark.tags",
          bookmarkId: bookmark.id,
          tagIds: ["f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7"],
          createdTags: [
            {
              id: "f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7",
              name: "Offline tag",
            },
          ],
          baseVersions: { tags: 0 },
        },
      ],
    });

    expect(conflict.conflicts).toEqual([
      expect.objectContaining({
        bookmarkId: bookmark.id,
        field: "tags",
        localValue: ["f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7"],
        createdTags: [
          {
            id: "f7661fd2-3b55-4c7b-9ef8-f9ca90bc8fb7",
            name: "Offline tag",
          },
        ],
        serverVersion: 1,
      }),
    ]);
  });

  test<CustomTestContext>("emits a revocation and no longer returns revoked shared content", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "shared offline record",
    });
    const list = await owner.lists.create({
      name: "Shared",
      icon: "folder",
      type: "manual",
    });
    await owner.lists.addToList({ listId: list.id, bookmarkId: bookmark.id });
    const collaboratorUser = await collaborator.users.whoami();
    const { invitationId } = await owner.lists.addCollaborator({
      listId: list.id,
      email: collaboratorUser.email!,
      role: "viewer",
    });
    await collaborator.lists.acceptInvitation({ invitationId });

    const beforeRevocation = await collaborator.offlineSync.snapshot();
    await owner.lists.removeCollaborator({
      listId: list.id,
      userId: collaboratorUser.id,
    });
    const afterRevocation = await collaborator.offlineSync.pull({
      cursor: beforeRevocation.cursor,
    });
    const snapshot = await collaborator.offlineSync.snapshot();

    expect(beforeRevocation.bookmarks.map((item) => item.id)).toContain(
      bookmark.id,
    );
    expect(beforeRevocation.bookmarkListMemberships).toContainEqual({
      bookmarkId: bookmark.id,
      listId: list.id,
    });
    expect(afterRevocation.events).toContainEqual(
      expect.objectContaining({
        entityType: "list",
        entityId: list.id,
        operation: "revoke",
      }),
    );
    expect(snapshot.bookmarks.map((item) => item.id)).not.toContain(
      bookmark.id,
    );
    expect(snapshot.lists.map((item) => item.id)).not.toContain(list.id);
    expect(snapshot.bookmarkListMemberships).not.toContainEqual({
      bookmarkId: bookmark.id,
      listId: list.id,
    });
  });

  test<CustomTestContext>("withholds historical bookmark field versions after a collaborator is revoked", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "historical shared offline record",
    });
    const list = await owner.lists.create({
      name: "Shared",
      icon: "folder",
      type: "manual",
    });
    await owner.lists.addToList({ listId: list.id, bookmarkId: bookmark.id });
    const collaboratorUser = await collaborator.users.whoami();
    const { invitationId } = await owner.lists.addCollaborator({
      listId: list.id,
      email: collaboratorUser.email!,
      role: "viewer",
    });
    await collaborator.lists.acceptInvitation({ invitationId });

    const beforeUpdate = await collaborator.offlineSync.snapshot();
    await owner.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      title: "updated before revocation",
    });
    await owner.lists.removeCollaborator({
      listId: list.id,
      userId: collaboratorUser.id,
    });

    const delta = await collaborator.offlineSync.pull({
      cursor: beforeUpdate.cursor,
    });

    expect(delta.events).toContainEqual(
      expect.objectContaining({
        entityType: "bookmark",
        entityId: bookmark.id,
        changedFields: ["title"],
        fieldVersions: [],
      }),
    );
    expect(delta.events).toContainEqual(
      expect.objectContaining({
        entityType: "list",
        entityId: list.id,
        operation: "revoke",
        fieldVersions: [],
      }),
    );
    expect(
      delta.events.flatMap((event) =>
        event.fieldVersions.filter(
          (fieldVersion) => fieldVersion.bookmarkId === bookmark.id,
        ),
      ),
    ).toEqual([]);
  });

  test<CustomTestContext>("delivers owner bookmark updates and deletes to shared collaborators", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const bookmark = await owner.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "shared content",
    });
    const list = await owner.lists.create({
      name: "Shared",
      icon: "folder",
      type: "manual",
    });
    await owner.lists.addToList({ listId: list.id, bookmarkId: bookmark.id });
    const collaboratorUser = await collaborator.users.whoami();
    const { invitationId } = await owner.lists.addCollaborator({
      listId: list.id,
      email: collaboratorUser.email!,
      role: "viewer",
    });
    await collaborator.lists.acceptInvitation({ invitationId });
    const beforeUpdate = await collaborator.offlineSync.snapshot();

    await owner.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      title: "updated by owner",
    });
    const afterUpdate = await collaborator.offlineSync.pull({
      cursor: beforeUpdate.cursor,
    });
    const versionOnePush = await owner.offlineSync.push({
      mutations: [
        {
          idempotencyKey: "8ca4a420-602a-4e5a-b5f2-05be95a49461",
          kind: "bookmark.update",
          bookmarkId: bookmark.id,
          fields: { title: "offline version one" },
          baseVersions: { title: 1 },
        },
      ],
    });
    await owner.bookmarks.deleteBookmark({ bookmarkId: bookmark.id });
    const afterDelete = await collaborator.offlineSync.pull({
      cursor: afterUpdate.cursor,
    });

    expect(afterUpdate.events).toEqual([
      expect.objectContaining({
        userId: collaboratorUser.id,
        entityType: "bookmark",
        entityId: bookmark.id,
        operation: "update",
      }),
    ]);
    expect(versionOnePush.acknowledged).toEqual([
      "8ca4a420-602a-4e5a-b5f2-05be95a49461",
    ]);
    expect(afterDelete.events).toEqual([
      expect.objectContaining({
        userId: collaboratorUser.id,
        entityType: "bookmark",
        entityId: bookmark.id,
        operation: "update",
      }),
      expect.objectContaining({
        userId: collaboratorUser.id,
        entityType: "bookmark",
        entityId: bookmark.id,
        operation: "delete",
      }),
    ]);
  });
});
