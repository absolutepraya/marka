import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

async function addAndAcceptCollaborator(
  ownerApi: APICallerType,
  collaboratorApi: APICallerType,
  listId: string,
  role: "viewer" | "editor",
) {
  const collaborator = await collaboratorApi.users.whoami();
  const { invitationId } = await ownerApi.lists.addCollaborator({
    listId,
    email: collaborator.email!,
    role,
  });
  await collaboratorApi.lists.acceptInvitation({ invitationId });
}

describe("Bookmark content permissions", () => {
  test<CustomTestContext>("requires an explicit grant and a current manual-list view for body edits", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];
    const list = await ownerApi.lists.create({
      name: "Shared writing",
      icon: "✍️",
      type: "manual",
    });
    const bookmark = await ownerApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Initial body",
    });
    await ownerApi.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    await addAndAcceptCollaborator(
      ownerApi,
      collaboratorApi,
      list.id,
      "editor",
    );

    const beforeGrant = await collaboratorApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    expect(beforeGrant.hasCurrentManualView).toBe(true);
    expect(beforeGrant.canEdit).toBe(false);

    const ownerPermissions = await ownerApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    expect(ownerPermissions.canManage).toBe(true);
    expect(ownerPermissions.eligibleUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: (await collaboratorApi.users.whoami()).id,
        }),
      ]),
    );

    await ownerApi.bookmarks.grantContentEditor({
      bookmarkId: bookmark.id,
      userId: (await collaboratorApi.users.whoami()).id,
    });

    const granted = await collaboratorApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    expect(granted.canEdit).toBe(true);

    await collaboratorApi.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      text: "",
      textBaseVersion: granted.textVersion,
    });
    const emptyBookmark = await ownerApi.bookmarks.getBookmark({
      bookmarkId: bookmark.id,
    });
    expect(emptyBookmark.content).toMatchObject({
      type: BookmarkTypes.TEXT,
      text: "",
    });

    const beforeOwnerSave = await ownerApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    await ownerApi.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      text: "Server body",
      textBaseVersion: beforeOwnerSave.textVersion,
    });

    await expect(
      collaboratorApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        text: "Stale body",
        textBaseVersion: granted.textVersion + 1,
      }),
    ).rejects.toThrow(/changed after this draft was opened/);

    await expect(
      collaboratorApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Not allowed",
      }),
    ).rejects.toThrow(/User is not allowed to access resource/);
  });

  test<CustomTestContext>("invalidates a grant when the collaborator is removed and re-shared", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];
    const collaborator = await collaboratorApi.users.whoami();
    const list = await ownerApi.lists.create({
      name: "Re-share me",
      icon: "🔁",
      type: "manual",
    });
    const bookmark = await ownerApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Body",
    });
    await ownerApi.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    await addAndAcceptCollaborator(
      ownerApi,
      collaboratorApi,
      list.id,
      "viewer",
    );
    await ownerApi.bookmarks.grantContentEditor({
      bookmarkId: bookmark.id,
      userId: collaborator.id,
    });

    await ownerApi.lists.removeCollaborator({
      listId: list.id,
      userId: collaborator.id,
    });
    await addAndAcceptCollaborator(
      ownerApi,
      collaboratorApi,
      list.id,
      "viewer",
    );

    const afterReshare = await collaboratorApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    expect(afterReshare.hasCurrentManualView).toBe(true);
    expect(afterReshare.canEdit).toBe(false);

    await expect(
      collaboratorApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        text: "Needs a new grant",
        textBaseVersion: afterReshare.textVersion,
      }),
    ).rejects.toThrow(/not allowed to edit this bookmark's content/);

    await ownerApi.bookmarks.grantContentEditor({
      bookmarkId: bookmark.id,
      userId: collaborator.id,
    });
    const regranted = await collaboratorApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    await collaboratorApi.bookmarks.updateBookmark({
      bookmarkId: bookmark.id,
      text: "Fresh grant body",
      textBaseVersion: regranted.textVersion,
    });
    const saved = await ownerApi.bookmarks.getBookmark({
      bookmarkId: bookmark.id,
    });
    expect(saved.content).toMatchObject({
      type: BookmarkTypes.TEXT,
      text: "Fresh grant body",
    });
  });

  test<CustomTestContext>("invalidates a grant when the bookmark leaves its view list", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];
    const collaborator = await collaboratorApi.users.whoami();
    const list = await ownerApi.lists.create({
      name: "Remove and re-add",
      icon: "↩️",
      type: "manual",
    });
    const bookmark = await ownerApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Body",
    });
    await ownerApi.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    await addAndAcceptCollaborator(
      ownerApi,
      collaboratorApi,
      list.id,
      "viewer",
    );
    await ownerApi.bookmarks.grantContentEditor({
      bookmarkId: bookmark.id,
      userId: collaborator.id,
    });

    await ownerApi.lists.removeFromList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    await ownerApi.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });

    const permission = await collaboratorApi.bookmarks.getContentPermissions({
      bookmarkId: bookmark.id,
    });
    expect(permission.hasCurrentManualView).toBe(true);
    expect(permission.canEdit).toBe(false);
    await expect(
      collaboratorApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        text: "Needs a fresh grant",
        textBaseVersion: permission.textVersion,
      }),
    ).rejects.toThrow(/not allowed to edit this bookmark's content/);
  });
});
