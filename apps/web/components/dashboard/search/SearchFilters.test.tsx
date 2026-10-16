// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import {
  appendSearchFilters,
  readSearchFilters,
  SearchFilters,
} from "./SearchFilters";

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

test("loads current filters and replaces or clears them on apply", () => {
  const onApply = vi.fn();
  const query =
    'react is:link is:fav list:"Old list" tag:"reading" url:"example.com" after:"2026-01-01" before:"2026-10-01" title:"guide" -tag:"hidden"';
  render(
    <SearchFilters
      query={query}
      onApply={onApply}
      onOpen={vi.fn()}
      offline={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "search.filters" }));
  expect(
    (screen.getByLabelText("search.content_type") as HTMLSelectElement).value,
  ).toBe("is:link");
  expect(
    (screen.getByLabelText("search.status") as HTMLSelectElement).value,
  ).toBe("is:fav");
  for (const [label, value] of [
    ["search.is_in_list", "Old list"],
    ["search.has_tag", "reading"],
    ["search.url_contains", "example.com"],
    ["search.created_on_or_after", "2026-01-01"],
    ["search.created_on_or_before", "2026-10-01"],
  ])
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(
      value,
    );
  fireEvent.change(screen.getByLabelText("search.content_type"), {
    target: { value: "is:text" },
  });
  fireEvent.change(screen.getByLabelText("search.status"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("search.is_in_list"), {
    target: { value: "New list" },
  });
  for (const label of [
    "search.has_tag",
    "search.url_contains",
    "search.created_on_or_after",
    "search.created_on_or_before",
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
  }
  fireEvent.click(screen.getByRole("button", { name: "search.apply_filters" }));
  const applied = onApply.mock.calls[0][0];
  expect(applied).toBe(
    '(react title:"guide" -tag:"hidden") is:text list:"New list"',
  );
  expect(parseSearchQuery(applied)).toMatchObject({
    result: "full",
    text: "react",
  });
});

test("Any removes the last filter and reopening reads the latest query", () => {
  const onApply = vi.fn();
  const { rerender } = render(
    <SearchFilters
      query="is:link"
      onApply={onApply}
      onOpen={vi.fn()}
      offline={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "search.filters" }));
  fireEvent.change(screen.getByLabelText("search.content_type"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "search.apply_filters" }));
  expect(onApply).toHaveBeenCalledWith("");
  rerender(
    <SearchFilters
      query="is:media"
      onApply={onApply}
      onOpen={vi.fn()}
      offline={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "search.filters" }));
  expect(
    (screen.getByLabelText("search.content_type") as HTMLSelectElement).value,
  ).toBe("is:media");
});

test("preserves OR alternatives, quoted text, inverse and unrelated qualifiers", () => {
  const query =
    '(is:link OR list:"Work") AND (react is:fav) source:api -list:"Hidden" title:"tag:literal"';
  const { values, remainder } = readSearchFilters(query);
  expect(values.type).toBe("");
  expect(values.list).toBe("");
  expect(values.status).toBe("is:fav");
  expect(remainder).toBe(
    '(is:link OR list:"Work") (react) source:api -list:"Hidden" title:"tag:literal"',
  );
  expect(
    parseSearchQuery(appendSearchFilters(remainder, ["is:archived"])),
  ).toMatchObject({
    result: "full",
    matcher: {
      type: "and",
      matchers: expect.arrayContaining([
        {
          type: "or",
          matchers: [
            { type: "type", typeName: "link", inverse: false },
            { type: "listName", listName: "Work", inverse: false },
          ],
        },
        { type: "archived", archived: true },
      ]),
    },
  });
});

test("keeps incomplete queries and dates unsupported by date inputs intact", () => {
  for (const query of [
    "react (is:link",
    'react after:"2026-01-01T12:00:00Z"',
  ]) {
    expect(readSearchFilters(query).remainder).toBe(query);
    expect(readSearchFilters(query).values.after).toBe("");
  }
});

test("preserves a literal leading AND in free text", () => {
  const { values, remainder } = readSearchFilters("and react is:link");
  expect(values.type).toBe("is:link");
  expect(remainder).toBe("and react");
});
