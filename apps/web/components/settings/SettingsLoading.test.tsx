// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import FeedSettings from "./FeedSettings";
import WebhookSettings from "./WebhookSettings";
import BackupSettings from "./BackupSettings";
import AssetsSettings from "./AssetsSettings";
import BrokenLinksSettings from "./BrokenLinksSettings";
import { TaggingRules } from "./AISettings";
import RulesSettingsPage from "@/app/settings/rules/page";

const state = vi.hoisted(() => ({
  loading: true,
  data: undefined as unknown,
  pendingIds: [] as string[],
}));
vi.hoisted(async () => {
  vi.stubGlobal("React", await import("react"));
});
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/lib/userSettings", () => ({
  useUserSettings: () => ({
    backupsEnabled: false,
    backupsFrequency: "daily",
    backupsRetentionDays: 30,
  }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () =>
    Object.fromEntries(
      [
        "feeds",
        "webhooks",
        "backups",
        "prompts",
        "assets",
        "bookmarks",
        "rules",
        "users",
      ].map((name) => [
        name,
        new Proxy(
          {},
          {
            get: (_target, key) => ({
              queryOptions: () => ({ queryKey: [`${name}.${String(key)}`] }),
              infiniteQueryOptions: () => ({
                queryKey: [`${name}.${String(key)}`],
              }),
              mutationOptions: () => ({}),
              pathFilter: () => ({}),
            }),
          },
        ),
      ]),
    ),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: state.data,
    isLoading: state.loading,
    isPending: state.loading,
  }),
  useInfiniteQuery: () => ({
    data: state.data,
    isLoading: state.loading,
    isPending: state.loading,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/hooks/useUndoableBookmarkDeletion", () => ({
  useUndoableBookmarkDeletion: () => ({
    scheduleDelete: vi.fn(),
    pendingBookmarkIds: state.pendingIds,
  }),
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  state.loading = true;
  state.data = undefined;
  state.pendingIds = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
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
});
describe("settings content loading", () => {
  it.each([
    ["feeds", FeedSettings],
    ["webhooks", WebhookSettings],
    ["backups", BackupSettings],
    ["assets", AssetsSettings],
    ["broken-links", BrokenLinksSettings],
    ["ai-prompts", TaggingRules],
    ["rules", RulesSettingsPage],
  ] as const)(
    "uses captured content while %s is fetched",
    (name, Component) => {
      const view = render(
        <TooltipProvider>
          <Component />
        </TooltipProvider>,
      );
      expect(
        view.container.querySelector(`[data-content-skeleton="${name}"]`),
      ).toBeTruthy();
    },
  );
  it("does not report an empty broken-links result when the query has no data", () => {
    state.loading = false;
    const view = render(<BrokenLinksSettings />);
    expect(view.queryByText("No broken links found")).toBeNull();
  });
  it("continues hiding bookmarks with a pending undoable deletion", () => {
    state.loading = false;
    state.pendingIds = ["b1"];
    state.data = {
      bookmarks: [
        {
          id: "b1",
          url: "https://example.com/hidden",
          statusCode: 404,
          isCrawlingFailure: false,
          createdAt: null,
          crawledAt: null,
        },
      ],
    };
    const view = render(<BrokenLinksSettings />);
    expect(view.queryByText("https://example.com/hidden")).toBeNull();
    expect(view.getByText("No broken links found")).toBeTruthy();
  });
});
