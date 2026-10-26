// @vitest-environment jsdom

import React from "react";
import type { ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ManageListsModal from "@/components/dashboard/bookmarks/ManageListsModal";
import { SharedContentPermissionsModal } from "@/components/dashboard/bookmarks/SharedContentPermissionsModal";
import { ManageCollaboratorsModal } from "@/components/dashboard/lists/ManageCollaboratorsModal";
import { listsToTree } from "@karakeep/shared/utils/listUtils";

const state = vi.hoisted(() => ({
  pending: true,
  online: true,
  data: {} as Record<string, unknown>,
  listData: [] as unknown[],
  cached: undefined as unknown,
  mutate: vi.fn(),
  queryOptions: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.hoisted(async () => vi.stubGlobal("React", await import("react")));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => {
    const endpoint = (name: string) => ({
      queryOptions: (...args: unknown[]) => {
        state.queryOptions(name, ...args);
        return {};
      },
      mutationOptions: (options: object) => ({ ...options, name }),
      queryFilter: () => ({}),
      infiniteQueryFilter: () => ({}),
      pathFilter: () => ({}),
    });
    return {
      lists: Object.fromEntries(
        [
          "getCollaborators",
          "getListsOfBookmark",
          "addCollaborator",
          "updateCollaborator",
          "removeCollaborator",
          "updateInvitation",
          "resendInvitation",
          "revokeInvitation",
          "getPendingInvitations",
        ].map((name) => [name, endpoint(name)]),
      ),
      bookmarks: Object.fromEntries(
        [
          "getContentPermissions",
          "grantContentEditor",
          "revokeContentEditor",
          "getBookmarks",
        ].map((name) => [name, endpoint(name)]),
      ),
    };
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.pending ? undefined : state.data,
    isPending: state.pending,
    isLoading: state.pending,
  }),
  useMutation: (options: { name: string }) => ({
    isPending: false,
    mutate: (input: unknown) => state.mutate(options.name, input),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useBookmarkLists: () => ({
    data: listsToTree(state.listData as Parameters<typeof listsToTree>[0]),
    isPending: state.pending,
  }),
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({
    kind: state.online ? "online" : "offline",
  }),
}));
vi.mock("@/lib/offline-library/repository", () => ({ offlineLibraryDb: {} }));
vi.mock("dexie", () => ({
  liveQuery: () => ({
    subscribe: ({ next }: { next: (data: unknown) => void }) => {
      next(state.cached);
      return { unsubscribe: state.unsubscribe };
    },
  }),
}));
vi.mock("@/lib/hooks/useOfflineSafeBookmarkMutation", () => ({
  isOfflineQueuedMutation: () => false,
  useOfflineSafeBookmarkListMembership: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => state.mutate("membership", input),
  }),
}));
vi.mock("@/components/dashboard/lists/BookmarkListSelector", () => ({
  BookmarkListSelector: ({
    onChange,
    disabled,
  }: {
    onChange: (id: string) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onChange("destination")}>
      Choose destination
    </button>
  ),
}));
vi.mock(
  "@/components/dashboard/bookmarks/action-buttons/ArchiveBookmarkButton",
  () => ({ default: () => <button>Archive</button> }),
);

const list: ComponentProps<typeof ManageCollaboratorsModal>["list"] = {
  id: "list-1",
  name: "Reading",
  icon: "📚",
  parentId: null,
  type: "manual",
  public: false,
  hasCollaborators: true,
  userRole: "owner",
};
const person = {
  id: "person-1",
  name: "Jamie Rivera",
  email: "jamie@example.com",
  image: null,
};
const member = {
  id: "grant-1",
  userId: person.id,
  user: person,
  role: "editor",
  recursive: false,
  inherited: false,
  status: "accepted",
  expired: false,
};
const bookmark = { id: "bookmark-1" } as ComponentProps<
  typeof SharedContentPermissionsModal
>["bookmark"];

beforeEach(() => {
  state.pending = true;
  state.online = true;
  state.data = {};
  state.listData = [list];
  state.cached = undefined;
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dialog loading boundaries", () => {
  it.each(["manage-lists", "collaborators", "content-editors"])(
    "replaces %s loading with live content and retains close behavior",
    (name) => {
      const close = vi.fn();
      const element =
        name === "manage-lists" ? (
          <ManageListsModal bookmarkId={bookmark.id} open setOpen={close} />
        ) : name === "collaborators" ? (
          <ManageCollaboratorsModal list={list} open setOpen={close} />
        ) : (
          <SharedContentPermissionsModal
            bookmark={bookmark}
            open
            setOpen={close}
          />
        );
      const view = render(element);
      const status = screen.getByRole("status");
      expect(status.getAttribute("data-content-skeleton")).toBe(name);
      expect(status.getAttribute("aria-busy")).toBe("true");
      expect(status.querySelector("button,input,select")).toBeNull();
      expect(status.firstElementChild?.getAttribute("aria-hidden")).toBe(
        "true",
      );
      state.pending = false;
      state.data =
        name === "manage-lists"
          ? { lists: [list] }
          : name === "collaborators"
            ? { owner: person, collaborators: [] }
            : {
                editors: [{ ...person, grantedAt: new Date(0) }],
                eligibleUsers: [],
              };
      view.rerender(React.cloneElement(element));
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        screen.getByText(name === "manage-lists" ? /Reading/ : person.name),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", {
          name:
            name === "content-editors"
              ? "shared_content.close"
              : "actions.close",
        }),
      );
      expect(close).toHaveBeenCalledWith(false);
    },
  );

  it("keeps cached offline memberships usable without online query enablement", async () => {
    state.online = false;
    state.cached = { lists: [list], membershipListIds: new Set([list.id]) };
    const view = render(
      <ManageListsModal bookmarkId={bookmark.id} open setOpen={vi.fn()} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Reading/)).toBeTruthy();
    expect(state.queryOptions).toHaveBeenCalledWith(
      "getListsOfBookmark",
      { bookmarkId: bookmark.id },
      { enabled: false },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "actions.remove_from_list" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    expect(state.mutate).toHaveBeenCalledWith("membership", {
      bookmarkId: bookmark.id,
      listId: list.id,
      action: "remove",
    });
    expect(state.mutate).toHaveBeenCalledWith("membership", {
      bookmarkId: bookmark.id,
      listId: "destination",
      action: "add",
    });
    view.unmount();
    expect(state.unsubscribe).toHaveBeenCalled();
  });

  it("preserves read-only collaborators, inherited badges, and declined filtering", () => {
    state.pending = false;
    state.data = {
      owner: null,
      collaborators: [
        { ...member, inherited: true, sourceListName: "Parent" },
        {
          ...member,
          id: "declined",
          status: "declined",
          user: { ...person, name: "Declined person" },
        },
      ],
    };
    render(
      <ManageCollaboratorsModal list={list} open setOpen={vi.fn()} readOnly />,
    );
    expect(screen.getByText(person.name)).toBeTruthy();
    expect(screen.getByText("lists.collaboration.inherited")).toBeTruthy();
    expect(screen.queryByText("Declined person")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("lists.collaboration.override_here")).toBeNull();
  });

  it("retains accepted collaborator removal confirmation and payload", () => {
    state.pending = false;
    state.data = { owner: null, collaborators: [member] };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ManageCollaboratorsModal list={list} open setOpen={vi.fn()} />);
    const remove = screen.getByRole("button", {
      name: "lists.collaboration.remove_aria",
    });
    fireEvent.click(remove);
    expect(state.mutate).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(remove);
    expect(state.mutate).toHaveBeenCalledWith("removeCollaborator", {
      listId: list.id,
      userId: person.id,
    });
  });

  it("keeps expired invitation changes disabled but permits resend and revoke", () => {
    state.pending = false;
    state.data = {
      owner: null,
      collaborators: [
        { ...member, status: "pending", expired: true, expiresAt: new Date(0) },
      ],
    };
    render(<ManageCollaboratorsModal list={list} open setOpen={vi.fn()} />);
    const role = screen.getByRole("combobox", {
      name: "lists.collaboration.pending_invitation_role",
    });
    expect(role.hasAttribute("disabled")).toBe(true);
    const row = role.closest(".rounded-lg") as HTMLElement;
    expect(within(row).getByRole("checkbox").hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "lists.collaboration.resend" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "lists.collaborators.revoke" }),
    );
    expect(state.mutate).toHaveBeenCalledWith("resendInvitation", {
      invitationId: member.id,
    });
    expect(state.mutate).toHaveBeenCalledWith("revokeInvitation", {
      invitationId: member.id,
    });
  });

  it("keeps editor grant disabled during loading and preserves revoke payload and empty state", () => {
    const element = (
      <SharedContentPermissionsModal
        bookmark={bookmark}
        open
        setOpen={vi.fn()}
      />
    );
    const view = render(element);
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "shared_content.grant_access" })
        .hasAttribute("disabled"),
    ).toBe(true);
    state.pending = false;
    state.data = {
      editors: [{ ...person, grantedAt: new Date(0) }],
      eligibleUsers: [],
    };
    view.rerender(React.cloneElement(element));
    fireEvent.click(
      screen.getByRole("button", { name: "shared_content.revoke" }),
    );
    expect(state.mutate).toHaveBeenCalledWith("revokeContentEditor", {
      bookmarkId: bookmark.id,
      userId: person.id,
    });
    state.data = { editors: [], eligibleUsers: [] };
    view.rerender(React.cloneElement(element));
    expect(screen.getByText("shared_content.no_editors")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
