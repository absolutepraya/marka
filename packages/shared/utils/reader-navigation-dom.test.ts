// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import {
  applyReaderSearchMarks,
  clearReaderSearchMarks,
  prepareReaderHeadings,
  setCurrentReaderSearchMark,
} from "./reader-navigation-dom";

describe("prepareReaderHeadings", () => {
  test("prepares h2 through h4 headings with unique focusable ids", () => {
    const container = document.createElement("article");
    container.innerHTML = `
      <h1>Ignored</h1>
      <h2>Getting Started</h2>
      <h3>Getting Started</h3>
      <h4 id="custom-id">Custom Heading</h4>
    `;

    const headings = prepareReaderHeadings(container);

    expect(headings.map(({ text, level }) => ({ text, level }))).toEqual([
      { text: "Getting Started", level: 2 },
      { text: "Getting Started", level: 3 },
      { text: "Custom Heading", level: 4 },
    ]);
    expect(headings.map(({ id }) => id)).toEqual([
      "reader-getting-started",
      "reader-getting-started-2",
      "custom-id",
    ]);
    expect(
      headings.every(
        ({ element }) => element.getAttribute("tabindex") === "-1",
      ),
    ).toBe(true);
  });
});

describe("Reader View search marks", () => {
  test("searches literally and case-insensitively without including excluded nodes", () => {
    const container = document.createElement("article");
    container.innerHTML = `
      <p>Reader view is useful. READER view is searchable.</p>
      <div data-reader-search-exclude>Reader view is hidden from search.</div>
    `;

    const marks = applyReaderSearchMarks(container, "reader view");

    expect(marks).toHaveLength(2);
    expect(marks.map((mark) => mark.textContent)).toEqual([
      "Reader view",
      "READER view",
    ]);
    expect(
      container.querySelectorAll("[data-reader-search-exclude] mark"),
    ).toHaveLength(0);

    clearReaderSearchMarks(container);
    expect(container.textContent).toContain("Reader view is useful.");
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  test("sets only the requested result as current", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>one one one</p>";
    const marks = applyReaderSearchMarks(container, "one");

    expect(setCurrentReaderSearchMark(marks, 1)).toBe(marks[1]);
    expect(
      marks.map((mark) => mark.hasAttribute("data-reader-search-current")),
    ).toEqual([false, true, false]);
    expect(setCurrentReaderSearchMark(marks, 9)).toBeNull();
  });

  test("does not throw when scrolling the current result", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>one one</p>";
    const marks = applyReaderSearchMarks(container, "one");
    const scrollIntoView = vi.fn();
    marks[0].scrollIntoView = scrollIntoView;

    setCurrentReaderSearchMark(marks, 0)?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
  });
});
