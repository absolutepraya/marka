// @vitest-environment jsdom

import React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookmarkCardSkeleton from "./BookmarkCardSkeleton";

let width = 175;
let desktop = false;
let onResize: (() => void) | undefined;
let onMediaChange: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal("React", React);
  width = 175;
  desktop = false;
  onResize = undefined;
  onMediaChange = undefined;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      toJSON: () => ({}),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe = (target: Element) => {
        if (target.hasAttribute("data-bookmark-skeleton")) {
          onResize = () => this.callback([]);
        }
      };
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(min-width: 640px)" && desktop;
    },
    addEventListener: (_: string, callback: () => void) => {
      if (query === "(min-width: 640px)") onMediaChange = callback;
    },
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("generated bookmark card loading", () => {
  it("keeps a CSS-sized fallback in server HTML before container measurement", () => {
    const html = renderToString(<BookmarkCardSkeleton layout="grid" />);
    expect(html).toContain("aspect-square");
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("data-boneyard-bone=");
  });

  it("renders generated bones and remeasures when the saved column count changes card width", () => {
    const { container } = render(<BookmarkCardSkeleton layout="masonry" />);
    const card = container.querySelector<HTMLElement>(
      "[data-bookmark-skeleton]",
    )!;
    expect(
      card.querySelectorAll("[data-boneyard-bone]").length,
    ).toBeGreaterThan(0);
    const before = parseFloat(card.style.height);
    act(() => {
      width = 190;
      onResize?.();
    });
    expect(parseFloat(card.style.height) - before).toBe(15);
    expect(
      card.querySelectorAll("[data-boneyard-bone]").length,
    ).toBeGreaterThan(0);
  });

  it("switches to fixed-height desktop grid captures even if card width stays the same", () => {
    const { container } = render(<BookmarkCardSkeleton layout="grid" />);
    const card = container.querySelector<HTMLElement>(
      "[data-bookmark-skeleton]",
    )!;
    expect(card.style.height).not.toBe("384px");
    act(() => {
      desktop = true;
      onMediaChange?.();
    });
    expect(card.style.height).toBe("384px");
  });
});
