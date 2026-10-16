// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchInput } from "./SearchInput";

const mocks = vi.hoisted(() => ({
  debounceSearch: vi.fn(),
  doSearch: vi.fn(),
  cancelSearch: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

class ResizeObserver {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

vi.stubGlobal("ResizeObserver", ResizeObserver);

vi.mock("@/lib/hooks/bookmark-search", () => ({
  useDoBookmarkSearch: () => ({
    debounceSearch: mocks.debounceSearch,
    searchQuery: "",
    doSearch: mocks.doSearch,
    cancelSearch: mocks.cancelSearch,
    parsedSearchQuery: { result: "empty" },
    isInSearchPage: false,
  }),
}));

vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({
    kind: "online",
    lastSyncedAt: new Date(),
    pendingWrites: 0,
  }),
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@karakeep/shared-react/hooks/search-history", () => ({
  useSearchHistory: () => ({ addTerm: vi.fn(), history: [] }),
}));

vi.mock("../lists/EditListModal", () => ({
  EditListModal: () => null,
}));

vi.mock("./QueryExplainerTooltip", () => ({
  default: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

vi.mock("./useSearchAutocomplete", () => ({
  useSearchAutocomplete: ({ isPopoverOpen }: { isPopoverOpen: boolean }) => ({
    suggestionGroups: [
      {
        id: "history",
        label: "Recent searches",
        items: [
          {
            type: "history",
            id: "recent-query",
            label: "Recent query",
            term: "recent query",
            Icon: () => null,
          },
        ],
      },
    ],
    hasSuggestions: true,
    isPopoverVisible: isPopoverOpen,
    handleSuggestionSelect: vi.fn(),
    handleCommandKeyDown: vi.fn(),
  }),
}));

describe("SearchInput", () => {
  it("keeps the input focused when opening autocomplete suggestions", async () => {
    render(<SearchInput />);

    const input = screen.getByPlaceholderText("search.placeholder");
    expect(fireEvent.pointerDown(input, { button: 0, ctrlKey: false })).toBe(
      true,
    );
    input.focus();

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });
});

it("puts the filter control inside the search surface and clears the query immediately", () => {
  render(<SearchInput />);
  const input = screen.getByRole("combobox");
  const filters = screen.getByRole("button", { name: "search.filters" });
  expect(input.closest("[cmdk-root]")?.contains(filters)).toBe(true);
  fireEvent.change(input, { target: { value: "react" } });
  fireEvent.click(screen.getByRole("button", { name: "actions.clear" }));
  expect(mocks.doSearch).toHaveBeenCalledWith("");
  expect((input as HTMLInputElement).value).toBe("");
});

it("does not search partial IME composition", () => {
  render(<SearchInput />);
  const input = screen.getByRole("combobox");
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "日本" } });
  expect(mocks.debounceSearch).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  expect(mocks.debounceSearch).toHaveBeenCalledWith("日本");
});
