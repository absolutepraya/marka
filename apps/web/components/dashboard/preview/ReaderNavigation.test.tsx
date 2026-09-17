// @vitest-environment jsdom

import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReaderNavigation from "./ReaderNavigation";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { current?: number; total?: number }) => {
      if (key === "preview.reader_search_matches") {
        return `${values?.current} of ${values?.total} matches`;
      }

      const translations: Record<string, string> = {
        "preview.reader_search_label": "Search within article",
        "preview.reader_search_next": "Next match",
        "preview.reader_search_no_matches": "No matches",
        "preview.reader_search_placeholder": "Search in article",
        "preview.reader_search_previous": "Previous match",
        "preview.reader_search_matches": "matches",
        "preview.reader_table_of_contents": "Table of contents",
      };
      return translations[key] ?? key;
    },
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function createContent(markup: string): RefObject<HTMLDivElement> {
  const content = document.createElement("div");
  content.innerHTML = markup;
  document.body.appendChild(content);
  return { current: content };
}

interface RefObject<T> {
  current: T;
}

describe("ReaderNavigation", () => {
  it("hides the table of contents when fewer than two h2 to h4 headings exist", async () => {
    const contentRef = createContent("<h2>Only one section</h2>");

    render(<ReaderNavigation contentRef={contentRef} contentKey="one" />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /table of contents/i }),
      ).toBeNull();
    });
  });

  it("navigates to a heading and returns focus to that heading", async () => {
    const contentRef = createContent(
      "<h2>First section</h2><p>Text</p><h3>Second section</h3>",
    );
    const firstHeading = contentRef.current.querySelector("h2");
    const secondHeading = contentRef.current.querySelector("h3");
    if (!firstHeading || !secondHeading) throw new Error("Missing headings");

    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    firstHeading.scrollIntoView = firstScroll;
    secondHeading.scrollIntoView = secondScroll;

    render(<ReaderNavigation contentRef={contentRef} contentKey="two" />);

    const tocButton = await screen.findByRole("button", {
      name: /table of contents/i,
    });
    fireEvent.click(tocButton);
    const navigation = await screen.findByRole("navigation", {
      name: /table of contents/i,
    });
    expect(within(navigation).getByText("1", { exact: true })).not.toBeNull();
    expect(within(navigation).getByText("1.1", { exact: true })).not.toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "Second section" }),
    );

    expect(secondScroll).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(document.activeElement).toBe(secondHeading);
    expect(
      screen.queryByRole("navigation", { name: /table of contents/i }),
    ).toBeNull();
  });

  it("reports literal matches and cycles with Enter and Shift+Enter", async () => {
    const contentRef = createContent(
      "<p>Alpha appears here.</p><p>ALPHA appears again.</p>",
    );

    render(<ReaderNavigation contentRef={contentRef} contentKey="search" />);

    const input = screen.getByRole("searchbox", {
      name: "Search within article",
    });
    fireEvent.change(input, { target: { value: "alpha" } });

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("1 of 2 matches");
      expect(
        contentRef.current.querySelectorAll("mark[data-reader-search-match]"),
      ).toHaveLength(2);
    });

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      const current = contentRef.current.querySelector(
        "mark[data-reader-search-current]",
      );
      expect(current?.textContent).toBe("ALPHA");
    });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    await waitFor(() => {
      const current = contentRef.current.querySelector(
        "mark[data-reader-search-current]",
      );
      expect(current?.textContent).toBe("Alpha");
    });
  });

  it("uses Escape to clear search and close the table of contents", async () => {
    const contentRef = createContent(
      "<h2>First section</h2><h2>Second section</h2><p>Alpha</p>",
    );

    render(<ReaderNavigation contentRef={contentRef} contentKey="escape" />);

    const input = screen.getByRole("searchbox", {
      name: "Search within article",
    });
    fireEvent.change(input, { target: { value: "alpha" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);

    const tocButton = await screen.findByRole("button", {
      name: /table of contents/i,
    });
    fireEvent.click(tocButton);

    const outsideInput = document.createElement("input");
    document.body.appendChild(outsideInput);
    outsideInput.focus();
    fireEvent.keyDown(outsideInput, { key: "Escape" });

    expect(
      screen.getByRole("navigation", { name: /table of contents/i }),
    ).not.toBeNull();

    fireEvent.keyDown(tocButton, { key: "Escape" });

    expect(
      screen.queryByRole("navigation", { name: /table of contents/i }),
    ).toBeNull();
    expect(document.activeElement).toBe(tocButton);
  });
});
