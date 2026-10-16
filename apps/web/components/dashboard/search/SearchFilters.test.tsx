// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { appendSearchFilters, SearchFilters } from "./SearchFilters";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(cleanup);

test("applies a filter to an entire OR expression without losing its meaning", () => {
  const parsed = parseSearchQuery(
    appendSearchFilters("is:fav OR is:archived", [
      'list:"My reading"',
      'after:"2026-01-01"',
    ]),
  );
  expect(parsed.result).toBe("full");
  expect(parsed.text).toBe("");
  expect(parsed.matcher).toMatchObject({
    type: "and",
    matchers: [
      { type: "or", matchers: [{ type: "favourited" }, { type: "archived" }] },
      { type: "listName", listName: "My reading" },
      { type: "dateAfter" },
    ],
  });
});

test("applies selected bookmark filters while preserving free text", () => {
  const onApply = vi.fn();
  render(
    <SearchFilters
      query="react"
      onApply={onApply}
      onOpen={vi.fn()}
      offline={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "search.filters" }));
  fireEvent.change(screen.getByLabelText("search.content_type"), {
    target: { value: "is:link" },
  });
  fireEvent.change(screen.getByLabelText("search.is_in_list"), {
    target: { value: "Web development" },
  });
  fireEvent.click(screen.getByRole("button", { name: "search.apply_filters" }));
  expect(onApply).toHaveBeenCalledWith(
    '(react) is:link list:"Web development"',
  );
  expect(parseSearchQuery(onApply.mock.calls[0][0])).toMatchObject({
    result: "full",
    text: "react",
  });
});

test("explains advanced filter limits offline and prevents applying them", () => {
  render(
    <SearchFilters query="react" onApply={vi.fn()} onOpen={vi.fn()} offline />,
  );
  fireEvent.click(screen.getByRole("button", { name: "search.filters" }));
  expect(screen.getByText("search.filters_offline")).toBeTruthy();
  expect(
    screen.getByLabelText("search.content_type").closest("fieldset")?.disabled,
  ).toBe(true);
});
