// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HeaderSurface from "./HeaderSurface";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("header scroll surface", () => {
  it("reveals frost after eight pixels and hides it again at the top", () => {
    vi.stubGlobal("scrollY", 0);
    const { container } = render(<HeaderSurface>Search all</HeaderSurface>);
    const header = container.querySelector("header")!;
    expect(header.dataset.scrolled).toBe("false");
    for (const [position, scrolled] of [
      [8, "false"],
      [9, "true"],
      [0, "false"],
    ] as const) {
      act(() => {
        vi.stubGlobal("scrollY", position);
        window.dispatchEvent(new Event("scroll"));
      });
      expect(header.dataset.scrolled).toBe(scrolled);
    }
  });

  it("resynchronizes restored scroll positions on mount and pageshow", () => {
    vi.stubGlobal("scrollY", 120);
    const { container } = render(<HeaderSurface>Search all</HeaderSurface>);
    const header = container.querySelector("header")!;
    expect(header.dataset.scrolled).toBe("true");
    act(() => {
      vi.stubGlobal("scrollY", 0);
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(header.dataset.scrolled).toBe("false");
  });
});

describe("header frost styles", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("stops rendering the backdrop blur at rest, not just fading it out", () => {
    // WebKit can keep painting backdrop-filter layers at opacity 0.
    const resting = rule(".mobile-header-frost-layer");
    expect(resting).toContain("opacity: 0");
    expect(resting).toContain("visibility: hidden");
    expect(resting).toMatch(/visibility 0s linear 180ms/);
    const scrolled = rule(
      '.mobile-header-frost[data-scrolled="true"] .mobile-header-frost-layer',
    );
    expect(scrolled).toContain("visibility: visible");
  });
});
