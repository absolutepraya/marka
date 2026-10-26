// @vitest-environment jsdom

import React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapturedSkeleton } from "./CapturedSkeleton";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: () => "Chargement…" }),
}));
const bones = {
  breakpoints: {
    390: {
      name: "fixture",
      viewportWidth: 390,
      width: 358,
      height: 400,
      bones: [
        [0, 0, 100, 400, 12, true],
        [5, 20, 40, 20, 4],
      ],
    },
    1440: {
      name: "fixture",
      viewportWidth: 1440,
      width: 896,
      height: 160,
      bones: [
        [0, 0, 100, 160, 12, true],
        [5, 20, 40, 20, 4],
      ],
    },
  },
};
let measuredWidth = 896;
let observers: (() => void)[] = [];
beforeEach(() => {
  measuredWidth = 896;
  observers = [];
  vi.stubGlobal("React", React);
  vi.stubGlobal("innerWidth", 1440);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width: measuredWidth,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: measuredWidth,
      toJSON: () => ({}),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(
        callback: (
          entries: { contentRect: { width: number; height: number } }[],
        ) => void,
      ) {
        observers.push(() =>
          callback([{ contentRect: { width: measuredWidth, height: 0 } }]),
        );
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("captured content skeleton", () => {
  it("renders a translated status and visible fallback on the server", () => {
    const html = renderToString(
      <CapturedSkeleton name="fixture" bones={bones} />,
    );
    expect(html).toContain('aria-label="Chargement…"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("bg-muted");
  });
  it("hides decorative bones and remounts at mobile height after resizing", () => {
    const view = render(<CapturedSkeleton name="fixture" bones={bones} />);
    expect(view.getAllByRole("status")).toHaveLength(1);
    const desktop = view.container.querySelector("[data-boneyard]")!;
    expect((desktop.parentElement as HTMLElement).style.height).toBe("160px");
    expect(
      view.container.querySelectorAll(
        '[aria-hidden="true"] [data-boneyard-bone]',
      ).length,
    ).toBeGreaterThan(0);
    act(() => {
      measuredWidth = 358;
      vi.stubGlobal("innerWidth", 390);
      window.dispatchEvent(new Event("resize"));
      observers.forEach((observer) => observer());
    });
    const mobile = view.container.querySelector("[data-boneyard]")!;
    expect(mobile).not.toBe(desktop);
    expect((mobile.parentElement as HTMLElement).style.height).toBe("400px");
  });
  it("clears the skeleton when real content replaces it", () => {
    const view = render(<CapturedSkeleton name="fixture" bones={bones} />);
    view.rerender(<div>Loaded content</div>);
    expect(view.queryByRole("status")).toBeNull();
    expect(view.container.querySelector("[data-boneyard]")).toBeNull();
  });
});
