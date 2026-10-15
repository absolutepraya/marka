// @vitest-environment jsdom

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
