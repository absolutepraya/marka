// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import AllHighlights from "./AllHighlights";
import HighlightsBox from "../preview/HighlightsBox";

const state = vi.hoisted(() => ({
  searchData: undefined as unknown,
  fetching: false,
  fetchNextPage: vi.fn(),
  boxLoading: true,
  boxData: undefined as unknown,
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    highlights: {
      getForBookmark: { queryOptions: () => ({}) },
      getAll: {
        infiniteQueryOptions: (_input: unknown, options: object) => ({
          kind: "all",
          ...options,
        }),
      },
      search: {
        infiniteQueryOptions: (_input: unknown, options: object) => ({
          kind: "search",
          ...options,
        }),
      },
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.boxData, isPending: state.boxLoading }),
  useInfiniteQuery: (options: {
    kind: string;
    initialData?: () => unknown;
  }) => ({
    data: options.kind === "all" ? options.initialData?.() : state.searchData,
    isPending: options.kind === "search" && !state.searchData,
    isFetching: state.fetching,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: state.fetchNextPage,
  }),
}));
vi.mock("@karakeep/shared-react/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));
vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));
vi.mock("@/lib/hooks/relative-time", () => ({
  default: () => ({ fromNow: "2 days ago", localCreatedAt: "January 1, 2000" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./HighlightCard", () => ({
  default: ({ highlight }: { highlight: { text: string } }) => (
    <p>{highlight.text}</p>
  ),
}));
const highlight = {
  id: "h1",
  userId: "u1",
  bookmarkId: "b1",
  createdAt: new Date("2000-01-01"),
  startOffset: 0,
  endOffset: 20,
  color: "yellow" as const,
  text: "Saved passage",
  note: null,
  contextBefore: null,
  contextAfter: null,
  transcriptRevision: null,
};
const initial = { highlights: [highlight], nextCursor: null };
beforeEach(() => {
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
  state.searchData = undefined;
  state.fetching = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("highlight loading boundaries", () => {
  it("replaces reader highlight placeholders with loaded content or the existing empty state", () => {
    state.boxLoading = true;
    const view = render(<HighlightsBox bookmarkId="b1" readOnly />);
    expect(
      view.container.querySelector('[data-content-skeleton="highlight-cards"]'),
    ).toBeTruthy();
    state.boxLoading = false;
    state.boxData = { highlights: [highlight] };
    view.rerender(<HighlightsBox bookmarkId="b1" readOnly />);
    expect(view.getByText("Saved passage")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
    state.boxData = { highlights: [] };
    view.rerender(<HighlightsBox bookmarkId="b1" readOnly />);
    expect(view.container.textContent).toBe("");
  });
  it("keeps server-seeded highlights visible during background refresh", () => {
    state.fetching = true;
    const view = render(
      <TooltipProvider>
        <AllHighlights highlights={initial} />
      </TooltipProvider>,
    );
    expect(view.getByText("Saved passage")).toBeTruthy();
    expect(view.container.querySelector("[data-content-skeleton]")).toBeNull();
  });
  it("shows captured rows for a new search and replaces them with loaded results", () => {
    const view = render(
      <TooltipProvider>
        <AllHighlights highlights={initial} />
      </TooltipProvider>,
    );
    fireEvent.change(view.getByRole("textbox"), {
      target: { value: "design" },
    });
    expect(
      view.container.querySelector('[data-content-skeleton="highlights"]'),
    ).toBeTruthy();
    state.searchData = {
      pages: [
        {
          highlights: [{ ...highlight, text: "Search passage" }],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    };
    view.rerender(
      <TooltipProvider>
        <AllHighlights highlights={initial} />
      </TooltipProvider>,
    );
    expect(view.queryByRole("status")).toBeNull();
    expect(view.getByText("Search passage")).toBeTruthy();
  });
  it("retains the search empty state after loading", () => {
    state.searchData = {
      pages: [{ highlights: [], nextCursor: null }],
      pageParams: [null],
    };
    const view = render(
      <TooltipProvider>
        <AllHighlights highlights={initial} />
      </TooltipProvider>,
    );
    fireEvent.change(view.getByRole("textbox"), {
      target: { value: "missing" },
    });
    expect(view.getByText("No highlights match your search")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
  });
});
