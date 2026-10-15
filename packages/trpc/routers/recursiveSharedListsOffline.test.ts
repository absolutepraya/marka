import { beforeEach, describe, expect, test } from "vitest";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

async function createNestedLists(owner: APICallerType) {
  const parent = await owner.lists.create({
    name: "Parent",
    icon: "folder",
    type: "manual",
  });
  const child = await owner.lists.create({
    name: "Child",
    icon: "folder",
    type: "manual",
    parentId: parent.id,
  });
  const grandchild = await owner.lists.create({
    name: "Grandchild",
    icon: "folder",
    type: "manual",
    parentId: child.id,
  });
  return { parent, child, grandchild };
}

async function inviteRecursively(
  owner: APICallerType,
  collaborator: APICallerType,
  listId: string,
) {
  const user = await collaborator.users.whoami();
  const { invitationId } = await owner.lists.addCollaborator({
    listId,
    email: user.email!,
    role: "viewer",
    recursive: true,
  });
  return { invitationId, user };
}

function listEvents(
  events: Awaited<ReturnType<APICallerType["offlineSync"]["pull"]>>["events"],
) {
  return events.filter((event) => event.entityType === "list");
}

describe("recursive shared-list offline sync", () => {
  test<CustomTestContext>("snapshots preserve visible shared-list parents without exposing private ancestors", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const { parent, child, grandchild } = await createNestedLists(owner);
    const { invitationId } = await inviteRecursively(
      owner,
      collaborator,
      child.id,
    );
    await collaborator.lists.acceptInvitation({ invitationId });

    const snapshot = await collaborator.offlineSync.snapshot();
    const live = await collaborator.lists.list();
    expect(snapshot.lists).toEqual(expect.arrayContaining(live.lists));
    expect(snapshot.lists).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: parent.id })]),
    );
    expect(snapshot.lists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: child.id, parentId: null }),
        expect.objectContaining({ id: grandchild.id, parentId: child.id }),
      ]),
    );
  });

  test<CustomTestContext>("accepting a recursive invitation creates every inherited list offline", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const { parent, child, grandchild } = await createNestedLists(owner);
    const { invitationId } = await inviteRecursively(
      owner,
      collaborator,
      parent.id,
    );
    const before = await collaborator.offlineSync.snapshot();

    await collaborator.lists.acceptInvitation({ invitationId });
    const delta = await collaborator.offlineSync.pull({
      cursor: before.cursor,
    });

    expect(listEvents(delta.events)).toEqual(
      expect.arrayContaining(
        [parent.id, child.id, grandchild.id].map((entityId) =>
          expect.objectContaining({ entityId, operation: "create" }),
        ),
      ),
    );
  });

  test<CustomTestContext>("a future child under a recursive grant is created offline", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const parent = await owner.lists.create({
      name: "Parent",
      icon: "folder",
      type: "manual",
    });
    const { invitationId } = await inviteRecursively(
      owner,
      collaborator,
      parent.id,
    );
    await collaborator.lists.acceptInvitation({ invitationId });
    const before = await collaborator.offlineSync.snapshot();

    const child = await owner.lists.create({
      name: "Future child",
      icon: "folder",
      type: "manual",
      parentId: parent.id,
    });
    const delta = await collaborator.offlineSync.pull({
      cursor: before.cursor,
    });

    expect(listEvents(delta.events)).toContainEqual(
      expect.objectContaining({ entityId: child.id, operation: "create" }),
    );
  });

  test<CustomTestContext>("disabling recursion revokes inherited descendants offline", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const { parent, child, grandchild } = await createNestedLists(owner);
    const { invitationId, user } = await inviteRecursively(
      owner,
      collaborator,
      parent.id,
    );
    await collaborator.lists.acceptInvitation({ invitationId });
    const before = await collaborator.offlineSync.snapshot();

    await owner.lists.updateCollaborator({
      listId: parent.id,
      userId: user.id,
      role: "viewer",
      recursive: false,
    });
    const delta = await collaborator.offlineSync.pull({
      cursor: before.cursor,
    });
    const events = listEvents(delta.events);

    expect(events).toEqual(
      expect.arrayContaining(
        [child.id, grandchild.id].map((entityId) =>
          expect.objectContaining({ entityId, operation: "revoke" }),
        ),
      ),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ entityId: parent.id, operation: "revoke" }),
    );
  });

  test<CustomTestContext>("moving a subtree out revokes all lost inherited lists offline", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const { parent, child, grandchild } = await createNestedLists(owner);
    const { invitationId } = await inviteRecursively(
      owner,
      collaborator,
      parent.id,
    );
    await collaborator.lists.acceptInvitation({ invitationId });
    const before = await collaborator.offlineSync.snapshot();

    await owner.lists.edit({ listId: child.id, parentId: null });
    const delta = await collaborator.offlineSync.pull({
      cursor: before.cursor,
    });
    const events = listEvents(delta.events);

    expect(events).toEqual(
      expect.arrayContaining(
        [child.id, grandchild.id].map((entityId) =>
          expect.objectContaining({ entityId, operation: "revoke" }),
        ),
      ),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ entityId: parent.id, operation: "revoke" }),
    );
  });

  test<CustomTestContext>("leaving from an inherited child revokes the whole source grant offline", async ({
    apiCallers,
  }) => {
    const owner = apiCallers[0];
    const collaborator = apiCallers[1];
    const { parent, child, grandchild } = await createNestedLists(owner);
    const { invitationId } = await inviteRecursively(
      owner,
      collaborator,
      parent.id,
    );
    await collaborator.lists.acceptInvitation({ invitationId });
    const before = await collaborator.offlineSync.snapshot();

    await collaborator.lists.leaveList({ listId: child.id });
    const delta = await collaborator.offlineSync.pull({
      cursor: before.cursor,
    });

    expect(listEvents(delta.events)).toEqual(
      expect.arrayContaining(
        [parent.id, child.id, grandchild.id].map((entityId) =>
          expect.objectContaining({ entityId, operation: "revoke" }),
        ),
      ),
    );
  });
});
