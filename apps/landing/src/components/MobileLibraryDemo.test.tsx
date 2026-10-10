import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landing } from "../content/landing";
import { MobileLibraryDemo } from "./MobileLibraryDemo";

let reduceMotion = false;
let motionPreferenceListener:
  | ((event: MediaQueryListEvent) => void)
  | undefined;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

class MockIntersectionObserver {
  static instance: MockIntersectionObserver | undefined;

  root = null;
  rootMargin = "0px";
  thresholds = [0.5];

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instance = this;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

const readyDemo = { ...landing.demos.mobile, status: "ready" as const };

const intersectionEntry = (
  target: Element,
  isIntersecting: boolean,
): IntersectionObserverEntry => {
  const bounds = new DOMRectReadOnly(0, 0, 100, 100);

  return {
    boundingClientRect: bounds,
    intersectionRect: isIntersecting ? bounds : new DOMRectReadOnly(),
    intersectionRatio: isIntersecting ? 0.75 : 0,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
};

describe("MobileLibraryDemo", () => {
  beforeEach(() => {
    reduceMotion = false;
    motionPreferenceListener = undefined;
    MockIntersectionObserver.instance = undefined;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        get matches() {
          return reduceMotion;
        },
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_type, listener) => {
          motionPreferenceListener = listener;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the labeled local poster while the mobile recording is pending", () => {
    const { container } = render(
      <MobileLibraryDemo demo={landing.demos.mobile} />,
    );

    expect(
      screen.getByRole("img", {
        name: /illustrative mobile library poster, not a marka screen capture/i,
      }),
    ).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).not.toMatch(/install|app store|native app/i);
    expect(play).not.toHaveBeenCalled();
  });

  it("plays a silent loop only in view and pauses it outside the viewport", async () => {
    const { container } = render(<MobileLibraryDemo demo={readyDemo} />);

    await waitFor(() =>
      expect(container.querySelector("video")).not.toBeNull(),
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    const observer = MockIntersectionObserver.instance;

    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe("metadata");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(play).not.toHaveBeenCalled();

    act(() => {
      observer?.callback(
        [intersectionEntry(video, true)],
        observer as unknown as IntersectionObserver,
      );
    });

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    act(() => {
      observer?.callback(
        [intersectionEntry(video, false)],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(pause).toHaveBeenCalled();
  });

  it("keeps the poster visible without creating a video for reduced motion", async () => {
    reduceMotion = true;

    const { container } = render(<MobileLibraryDemo demo={readyDemo} />);

    await waitFor(() => expect(container.querySelector("video")).toBeNull());
    expect(
      screen.getByRole("img", {
        name: /illustrative mobile library poster/i,
      }),
    ).toBeTruthy();
    expect(MockIntersectionObserver.instance).toBeUndefined();
    expect(play).not.toHaveBeenCalled();
  });

  it("pauses and returns to the poster if reduced motion is enabled later", async () => {
    const { container } = render(<MobileLibraryDemo demo={readyDemo} />);

    await waitFor(() =>
      expect(container.querySelector("video")).not.toBeNull(),
    );
    const video = container.querySelector("video") as HTMLVideoElement;

    reduceMotion = true;
    act(() => {
      motionPreferenceListener?.({
        matches: true,
      } as MediaQueryListEvent);
    });

    await waitFor(() => expect(container.querySelector("video")).toBeNull());
    expect(pause).toHaveBeenCalled();
    expect(video.isConnected).toBe(false);
  });
});
