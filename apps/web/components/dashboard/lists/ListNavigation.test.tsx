// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import translations from "@/lib/i18n/locales/en/translation.json";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listsToTree } from "@karakeep/shared/utils/listUtils";

const mocks = vi.hoisted(() => ({
  mobile: false,
  lists: [] as ZBookmarkList[],
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({ kind: "online" }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/lists/C" }));
vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: (data: unknown) => data,
  useQuery: () => ({ data: { stats: new Map() } }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({ lists: { stats: { queryOptions: () => ({}) } } }),
}));
vi.mock("@karakeep/shared-react/hooks/lists", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@karakeep/shared-react/hooks/lists")>();
  return {
    ...actual,
    useBookmarkLists: () => ({
      data: { data: mocks.lists, ...listsToTree(mocks.lists) },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useAddBookmarkToList: () => ({ mutateAsync: vi.fn() }),
    useRemoveBookmarkFromList: () => ({ mutateAsync: vi.fn() }),
  };
});
vi.mock("./ListOptions", () => ({
  ListOptions: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./EditListModal", () => ({
  EditListModal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("../sidebar/InvitationNotificationBadge", () => ({
  InvitationNotificationBadge: () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: i18next.t.bind(i18next) }),
}));
vi.mock("next/link", () => ({
  default: ({
    onNavigate,
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    onNavigate?: () => void;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onNavigate?.();
      }}
    >
      {children}
    </a>
  ),
}));

import ListBreadcrumbs from "./ListBreadcrumbs";
import { ListSwitcher, SublistNavigation } from "./ListNavigation";
import AllLists from "../sidebar/AllLists";

function list(id: string): ZBookmarkList {
  return {
    id,
    name: id,
    parentId: null,
    icon: "📁",
    type: "manual",
    public: false,
    hasCollaborators: false,
    userRole: "owner",
  };
}

beforeEach(async () => {
  vi.stubGlobal("React", React);
  mocks.mobile = false;
  mocks.lists = [
    list("A"),
    { ...list("C"), parentId: "A" },
    { ...list("D"), parentId: "A" },
    list("E"),
    { ...list("F"), name: "Far away", parentId: "E" },
  ];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  await i18next.init({
    lng: "en",
    resources: { en: { translation: translations } },
    interpolation: { escapeValue: false },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("sublist navigation", () => {
  it("exposes all children through a counted disclosure and can collapse them again", () => {
    render(
      <SublistNavigation
        lists={Array.from({ length: 8 }, (_, i) => list(`Child ${i + 1}`))}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
    const expand = screen.getByRole("button", { name: "Show 5 more sublists" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: "Child 8" }).getAttribute("href"),
    ).toBe("/dashboard/lists/Child 8");
    fireEvent.click(
      screen.getByRole("button", { name: "Show fewer sublists" }),
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("omits an empty section and does not hide any of three children", () => {
    const view = render(<SublistNavigation lists={[]} />);
    expect(screen.queryByRole("region")).toBeNull();
    view.rerender(
      <SublistNavigation
        lists={Array.from({ length: 3 }, (_, i) => list(`Child ${i}`))}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("list switcher", () => {
  it("marks the current list, searches unrelated branches and keeps All Lists available when search is empty", async () => {
    render(<ListSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch list" }));
    expect(
      screen.getByText("C").closest("a")!.getAttribute("aria-current"),
    ).toBe("page");
    const search = screen.getByRole("searchbox", {
      name: "Search lists",
    });
    fireEvent.change(search, { target: { value: "Far away" } });
    expect(screen.queryByText("C")).toBeNull();
    expect(
      screen.getByText("Far away").closest("a")?.getAttribute("href"),
    ).toBe("/dashboard/lists/F");
    fireEvent.change(search, { target: { value: "No match" } });
    expect(screen.getByText("No lists found")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "All Lists" }).getAttribute("href"),
    ).toBe("/dashboard/lists");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Switch list" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch list" }));
    expect(screen.getByRole("searchbox").getAttribute("value")).toBe("");
  });

  it("opens a named mobile sheet without focusing the search field", () => {
    mocks.mobile = true;
    render(<ListSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Switch list" }));
    const dialog = screen.getByRole("dialog", { name: "Switch list" });
    expect(within(dialog).getByText("D")).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("heading", { name: "Switch list" }),
    );
    fireEvent.click(within(dialog).getByText("D").closest("a")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the sidebar's tree expansion and search behavior", () => {
    render(<AllLists initialData={{ lists: mocks.lists }} />);
    expect(
      screen.getByText("C").closest("a")?.getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByText("Far away")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: i18next.t("lists.navigation.toggle_list", { name: "E" }),
      }),
    );
    expect(screen.getByText("Far away")).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: "Search lists" });
    fireEvent.change(search, { target: { value: "Far away" } });
    expect(screen.getByText("E").getAttribute("title")).toBe("E");
    expect(screen.getByText("Far away")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("translates the shared picker heading and named controls", async () => {
    i18next.addResourceBundle("id", "translation", {
      lists: {
        navigation: {
          heading: "Daftar",
          toggle_list: "Buka atau tutup {{name}}",
          list_options: "Opsi untuk {{name}}",
        },
      },
    });
    await i18next.changeLanguage("id");
    render(<AllLists initialData={{ lists: mocks.lists }} />);
    expect(screen.getByText("Daftar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buka atau tutup E" }));
    expect(screen.getByText("Far away")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Opsi untuk Far away" }),
    ).toBeTruthy();
  });
});

describe("list breadcrumbs", () => {
  it("exposes every desktop ancestor and the list index", () => {
    render(
      <ListBreadcrumbs path={[list("A"), list("B"), list("C"), list("D")]} />,
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["All Lists", "A", "B", "C"],
    );
    expect(screen.getByText("D").getAttribute("aria-current")).toBe("page");
  });

  it("keeps parent/current visible on mobile and exposes earlier ancestors through overflow", () => {
    mocks.mobile = true;
    render(
      <ListBreadcrumbs path={[list("A"), list("B"), list("C"), list("D")]} />,
    );
    expect(screen.queryByRole("link", { name: "A" })).toBeNull();
    expect(screen.getByRole("link", { name: "C" })).toBeTruthy();
    expect(screen.getByText("D").getAttribute("aria-current")).toBe("page");
    fireEvent.click(
      screen.getByRole("button", { name: "Show earlier ancestors" }),
    );
    expect(screen.getByRole("link", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "B" })).toBeTruthy();
  });
});
