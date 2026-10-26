import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

async function inviteAndAccept(
  ownerApi: APICallerType,
  collaboratorApi: APICallerType,
  listId: string,
  role: "viewer" | "editor",
  recursive: boolean,
) {
  const collaborator = await collaboratorApi.users.whoami();
  const { invitationId } = await ownerApi.lists.addCollaborator({
    listId,
    email: collaborator.email!,
    role,
    recursive,
  });
  await collaboratorApi.lists.acceptInvitation({ invitationId });
}

describe("recursive shared-list permissions", () => {
  test<CustomTestContext>("metadata edits preserve an unchanged parent owned by another user", async ({
    apiCallers,
  }) => {
    const [ownerApi, otherApi] = apiCallers;
    const foreignParent = await otherApi.lists.create({
      name: "Other owner's parent",
      icon: "📁",
      type: "manual",
    });
    // Existing create requests can establish cross-owner parentage. Updating
    // metadata must not require permission to manage that unchanged parent.
    const list = await ownerApi.lists.create({
      name: "Existing child",
      icon: "📁",
      type: "manual",
      parentId: foreignParent.id,
    });

    await ownerApi.lists.edit({
      listId: list.id,
      parentId: foreignParent.id,
      name: "Renamed child",
      description: "Updated description",
      icon: "📚",
    });

    expect(await ownerApi.lists.get({ listId: list.id })).toMatchObject({
      parentId: foreignParent.id,
      name: "Renamed child",
      description: "Updated description",
      icon: "📚",
    });
    await expect(
      ownerApi.lists.get({ listId: foreignParent.id }),
    ).rejects.toThrow("List not found");
  });

  test<CustomTestContext>("reparenting rejects destinations owned by another user, including shared-editor destinations", async ({
    apiCallers,
  }) => {
    const [ownerApi, otherApi] = apiCallers;
    const list = await ownerApi.lists.create({
      name: "Own list",
      icon: "📁",
      type: "manual",
    });
    const foreign = await otherApi.lists.create({
      name: "Other owner's list",
      icon: "📁",
      type: "manual",
    });
    await expect(
      ownerApi.lists.edit({ listId: list.id, parentId: foreign.id }),
    ).rejects.toThrow("List not found");
    await inviteAndAccept(otherApi, ownerApi, foreign.id, "editor", true);
    await expect(
      ownerApi.lists.edit({ listId: list.id, parentId: foreign.id }),
    ).rejects.toThrow();
    expect((await ownerApi.lists.get({ listId: list.id })).parentId).toBeNull();
    await expect(
      ownerApi.lists.edit({ listId: list.id, parentId: "missing" }),
    ).rejects.toThrow("List not found");
  });

  test<CustomTestContext>("recursive grant exposes current descendants", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "viewer", true);

    const inherited = await collaboratorApi.lists.get({ listId: child.id });
    expect(inherited.userRole).toBe("viewer");

    const { lists } = await collaboratorApi.lists.list();
    expect(lists.map((list) => list.id)).toEqual(
      expect.arrayContaining([parent.id, child.id]),
    );
  });

  test<CustomTestContext>("recursive grant automatically exposes descendants created later", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "editor", true);

    const futureChild = await ownerApi.lists.create({
      name: "Future child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });

    const inherited = await collaboratorApi.lists.get({
      listId: futureChild.id,
    });
    expect(inherited.userRole).toBe("editor");
  });

  test<CustomTestContext>("moving a list out of a recursive subtree revokes inherited access", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "viewer", true);
    expect(await collaboratorApi.lists.get({ listId: child.id })).toBeDefined();

    await ownerApi.lists.edit({
      listId: child.id,
      parentId: null,
    });

    await expect(
      collaboratorApi.lists.get({ listId: child.id }),
    ).rejects.toThrow("List not found");
  });

  test<CustomTestContext>("exact child grant overrides inherited role only for that list when not recursive", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });
    const grandchild = await ownerApi.lists.create({
      name: "Grandchild",
      icon: "📄",
      type: "manual",
      parentId: child.id,
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "viewer", true);
    await inviteAndAccept(ownerApi, collaboratorApi, child.id, "editor", false);

    expect(
      (await collaboratorApi.lists.get({ listId: child.id })).userRole,
    ).toBe("editor");
    expect(
      (await collaboratorApi.lists.get({ listId: grandchild.id })).userRole,
    ).toBe("viewer");
  });

  test<CustomTestContext>("nearest recursive ancestor grant wins for deeper descendants", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });
    const grandchild = await ownerApi.lists.create({
      name: "Grandchild",
      icon: "📄",
      type: "manual",
      parentId: child.id,
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "viewer", true);
    await inviteAndAccept(ownerApi, collaboratorApi, child.id, "editor", true);

    expect(
      (await collaboratorApi.lists.get({ listId: grandchild.id })).userRole,
    ).toBe("editor");
  });

  test<CustomTestContext>("inherited viewer remains read-only", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });
    const bookmark = await collaboratorApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Viewer bookmark",
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "viewer", true);

    await expect(
      collaboratorApi.lists.addToList({
        listId: child.id,
        bookmarkId: bookmark.id,
      }),
    ).rejects.toThrow("User is not allowed to edit this list");
  });

  test<CustomTestContext>("inherited editor contributions are tied to the granting recursive membership", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const collaboratorApi = apiCallers[1];
    const collaborator = await collaboratorApi.users.whoami();

    const parent = await ownerApi.lists.create({
      name: "Parent",
      icon: "📁",
      type: "manual",
    });
    const child = await ownerApi.lists.create({
      name: "Child",
      icon: "📄",
      type: "manual",
      parentId: parent.id,
    });
    const bookmark = await collaboratorApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Inherited editor bookmark",
    });

    await inviteAndAccept(ownerApi, collaboratorApi, parent.id, "editor", true);
    await collaboratorApi.lists.addToList({
      listId: child.id,
      bookmarkId: bookmark.id,
    });

    expect(
      (await ownerApi.bookmarks.getBookmarks({ listId: child.id })).bookmarks,
    ).toHaveLength(1);

    await ownerApi.lists.removeCollaborator({
      listId: parent.id,
      userId: collaborator.id,
    });

    expect(
      (await ownerApi.bookmarks.getBookmarks({ listId: child.id })).bookmarks,
    ).toHaveLength(0);
    expect(
      await collaboratorApi.bookmarks.getBookmark({ bookmarkId: bookmark.id }),
    ).toBeDefined();
  });
});
