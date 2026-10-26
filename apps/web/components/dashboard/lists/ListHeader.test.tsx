// @vitest-environment jsdom

import React, { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listsToTree } from "@karakeep/shared/utils/listUtils";

const mocks = vi.hoisted(() => ({
  cached: false,
  lists: [] as ZBookmarkList[],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en" },
  }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    lists: {
      get: { queryOptions: () => ({ kind: "get" }) },
      stats: { queryOptions: () => ({ kind: "stats" }) },
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: (value: unknown) => value,
  useQuery: ({ kind }: { kind: string }) => ({
    data:
      kind === "get"
        ? mocks.lists[1]
        : mocks.cached
          ? { stats: new Map([["games", 3]]) }
          : undefined,
  }),
}));
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useBookmarkLists: () => ({
    data: mocks.cached
      ? { data: mocks.lists, ...listsToTree(mocks.lists) }
      : undefined,
    isPending: !mocks.cached,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/dashboard/GlobalActions", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/editing-button", () => ({
  EditingButton: () => null,
}));
vi.mock("./ListOptions", () => ({ ListOptions: () => null }));
vi.mock("./ListHeaderComponents", () => ({
  ListPrivacyLabel: () => null,
  ListCollaboratorsIcons: () => null,
}));
vi.mock("./ListNavigation", () => ({
  ListSwitcher: () => null,
  SublistNavigation: () => null,
}));
vi.mock("./ListBreadcrumbs", () => ({
  default: ({ path }: { path: ZBookmarkList[] }) => (
    <nav>
      {path.map((list, index) =>
        index === path.length - 1 ? (
          <span key={list.id}>{list.name}</span>
        ) : (
          <a key={list.id} href={list.id}>
            {list.name}
          </a>
        ),
      )}
    </nav>
  ),
}));
vi.mock("../search/QueryExplainerTooltip", () => ({ default: () => null }));

import ListHeader from "./ListHeader";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.cached = false;
  const base = {
    type: "manual",
    icon: "📁",
    userRole: "owner",
    public: false,
    hasCollaborators: false,
  } as const;
  mocks.lists = [
    { ...base, id: "parent", name: "Library", parentId: null },
    { ...base, id: "games", name: "Games", parentId: "parent" },
  ];
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("hydrates the server breadcrumb snapshot before displaying a hierarchy warmed by the sidebar", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const component = <ListHeader initialData={mocks.lists[1]} />;
  container.innerHTML = renderToString(component);
  expect(container.querySelector("nav")?.textContent).toBe("Games");
  mocks.cached = true;
  const recoverable = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, component, {
      onRecoverableError: recoverable,
    });
  });
  expect(recoverable).not.toHaveBeenCalled();
  expect(container.querySelector("nav")?.textContent).toBe("LibraryGames");
  await act(async () => root.unmount());
});
