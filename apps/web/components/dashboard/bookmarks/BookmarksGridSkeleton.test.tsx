// @vitest-environment jsdom

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gridColumns: 3,
  isMobile: true,
  layout: "grid" as "grid" | "masonry" | "list" | "compact",
}));

vi.mock("@/lib/userLocalSettings/bookmarksLayout", () => ({
  bookmarkLayoutSwitch: (
    layout: string,
    views: Record<string, React.ReactNode>,
  ) => views[layout],
  useBookmarkLayout: () => mocks.layout,
  useGridColumns: () => mocks.gridColumns,
}));

vi.mock("@/lib/serverHints", () => ({
  useServerIsMobile: () => mocks.isMobile,
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: () => "Chargement…" }),
}));

import BookmarksGridSkeleton from "./BookmarksGridSkeleton";

beforeEach(() => {
  vi.stubGlobal("React", React);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.gridColumns = 3;
  mocks.isMobile = true;
  mocks.layout = "grid";
});

function renderMarkup() {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<BookmarksGridSkeleton />);
  return container;
}

const responsiveGridClass =
  "grid-cols-[repeat(var(--bookmark-grid-columns),minmax(0,1fr))]";

function getResponsiveGrid(container: HTMLElement) {
  return (
    [...container.querySelectorAll("div")].find((element) =>
      element.className.includes(responsiveGridClass),
    ) ?? null
  );
}

describe("BookmarksGridSkeleton responsive columns", () => {
  it("announces loading once while hiding decorative card geometry", () => {
    const container = renderMarkup();
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-label")).toBe("Chargement…");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
    expect(
      container.querySelector('[aria-hidden="true"] [data-bookmark-skeleton]'),
    ).not.toBeNull();
  });

  it("uses CSS media breakpoints in SSR markup before Masonry can measure", () => {
    mocks.isMobile = false;
    const grid = getResponsiveGrid(renderMarkup());

    expect(grid).not.toBeNull();
    expect(grid?.className).toContain(responsiveGridClass);
    expect(grid?.className).toContain(
      "[--bookmark-grid-columns:var(--bookmark-grid-columns-sm)]",
    );
    expect(grid?.className).toContain(
      "min-[641px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-md)]",
    );
    expect(grid?.className).toContain(
      "min-[769px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-lg)]",
    );
    expect(grid?.className).toContain(
      "min-[1025px]:[--bookmark-grid-columns:var(--bookmark-grid-columns-default)]",
    );
    expect(grid?.style.getPropertyValue("--bookmark-grid-columns-sm")).toBe(
      "2",
    );
    expect(
      grid?.style.getPropertyValue("--bookmark-grid-columns-default"),
    ).toBe("3");
  });

  it("keeps a two-column first paint at mobile widths with a desktop UA", () => {
    mocks.isMobile = false;
    const grid = getResponsiveGrid(renderMarkup());

    expect(grid?.className).toContain(
      "[--bookmark-grid-columns:var(--bookmark-grid-columns-sm)]",
    );
    expect(grid?.style.getPropertyValue("--bookmark-grid-columns-sm")).toBe(
      "2",
    );
    expect(grid?.style.getPropertyValue("--bookmark-grid-columns-md")).toBe(
      "2",
    );
  });

  it("caps the desktop default for a mobile UA without changing the saved preference", () => {
    mocks.isMobile = true;
    const grid = getResponsiveGrid(renderMarkup());

    expect(
      grid?.style.getPropertyValue("--bookmark-grid-columns-default"),
    ).toBe("2");
    expect(grid?.style.getPropertyValue("--bookmark-grid-columns-lg")).toBe(
      "2",
    );
  });

  it.each(["grid", "masonry"] as const)(
    "renders the responsive placeholder for the %s preference",
    (layout) => {
      mocks.layout = layout;
      const grid = getResponsiveGrid(renderMarkup());

      expect(grid?.className).toContain(responsiveGridClass);
    },
  );

  it.each(["list", "compact"] as const)(
    "preserves the %s single-column placeholder",
    (layout) => {
      mocks.layout = layout;
      const container = renderMarkup();

      expect(container.querySelector(".grid-cols-1")).not.toBeNull();
      expect(getResponsiveGrid(container)).toBeNull();
    },
  );
});
