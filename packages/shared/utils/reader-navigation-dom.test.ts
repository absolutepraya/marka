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

  test("searches across inline elements and collapsed whitespace", () => {
    const container = document.createElement("article");
    container.innerHTML =
      "<p>Reader<em>\n\tview</em> is useful. <strong>Reader view</strong></p>";

    const marks = applyReaderSearchMarks(container, "reader view");

    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("Reader");
    expect(marks[1]?.textContent).toBe("Reader view");
    expect(
      container.querySelectorAll("mark[data-reader-search-match]"),
    ).toHaveLength(3);
    expect(
      Array.from(
        container.querySelectorAll('mark[data-reader-search-match-index="0"]'),
      ).map((mark) => mark.textContent),
    ).toEqual(["Reader", "\n\tview"]);
  });

  test("preserves block structure when a match crosses inline and block nodes", () => {
    const container = document.createElement("article");
    const firstParagraph = document.createElement("p");
    const link = document.createElement("a");
    link.href = "/reader";
    link.textContent = "Reader";
    firstParagraph.append("Intro ", link, " ");
    const secondParagraph = document.createElement("p");
    secondParagraph.textContent = "view and Reader view";
    container.append(firstParagraph, secondParagraph);
    const originalStructure = container.innerHTML;

    const marks = applyReaderSearchMarks(container, "reader view");

    expect(marks).toHaveLength(2);
    expect(
      Array.from(
        container.querySelectorAll('mark[data-reader-search-match-index="0"]'),
      ),
    ).toHaveLength(3);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelectorAll("mark p, p mark p")).toHaveLength(0);

    clearReaderSearchMarks(container);
    expect(container.innerHTML).toBe(originalStructure);
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
