import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landing } from "../content/landing";
import { SourceLibraryAnimation } from "./SourceLibraryAnimation";

let intersectionCallback: IntersectionObserverCallback;
let observe: ReturnType<typeof vi.fn>;

class MockIntersectionObserver {
  root = null;
  rootMargin = "0px";
  thresholds = [0.2];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = (target: Element) => observe(target);
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

const setReducedMotion = (matches: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
};

describe("SourceLibraryAnimation", () => {
  beforeEach(() => {
    observe = vi.fn();
    setReducedMotion(false);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the source story readable as a static accessible library", () => {
    render(
      <SourceLibraryAnimation
        cards={landing.sourceCards}
        label={landing.sourceLibrary.regionLabel}
      />,
    );

    const region = screen.getByRole("region", {
      name: /from scattered saves to marka/i,
    });

    expect(region.querySelectorAll("[data-source-card]")).toHaveLength(7);
    expect(screen.getByText(/movie watchlists/i)).toBeTruthy();
    expect(screen.getByText(/course material/i)).toBeTruthy();
    expect(region.querySelector("video")).toBeNull();
    expect(region.getAttribute("data-animation-state")).toBe("waiting");
  });

  it("starts its one-time arrival in view and leaves a settled library", () => {
    vi.useFakeTimers();

    render(
      <SourceLibraryAnimation
        cards={landing.sourceCards}
        label={landing.sourceLibrary.regionLabel}
      />,
    );

    const region = screen.getByRole("region", {
      name: /from scattered saves to marka/i,
    });

    expect(observe).toHaveBeenCalledWith(region);

    act(() => {
      const bounds = new DOMRectReadOnly(0, 0, 100, 100);
      intersectionCallback(
        [
          {
            boundingClientRect: bounds,
            intersectionRect: bounds,
            isIntersecting: true,
            intersectionRatio: 0.35,
            rootBounds: null,
            target: region,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      );
    });

    expect(region.getAttribute("data-animation-state")).toBe("entering");

    act(() => {
      vi.advanceTimersByTime(760);
    });

    expect(region.getAttribute("data-animation-state")).toBe("settled");
  });

  it("shows the complete settled library immediately for reduced motion", () => {
    setReducedMotion(true);

    render(
      <SourceLibraryAnimation
        cards={landing.sourceCards}
        label={landing.sourceLibrary.regionLabel}
      />,
    );

    const region = screen.getByRole("region", {
      name: /from scattered saves to marka/i,
    });

    expect(region.querySelectorAll("[data-source-card]")).toHaveLength(7);
    expect(region.getAttribute("data-animation-state")).toBe("reduced");
    expect(observe).not.toHaveBeenCalled();
  });
});
