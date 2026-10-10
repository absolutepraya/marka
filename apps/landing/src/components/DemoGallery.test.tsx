import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LandingDemo } from "../content/landing";
import { landing } from "../content/landing";
import { DemoGallery } from "./DemoGallery";

let observers: MockIntersectionObserver[];
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  root = null;
  rootMargin = "0px";
  thresholds = [0.1];

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
}

const readyDemos = landing.demos.desktop.map(
  (demo): LandingDemo => ({ ...demo, status: "ready" }),
);

describe("DemoGallery", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    observers = MockIntersectionObserver.instances;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", {
          configurable: true,
          value: false,
        });
        return Promise.resolve();
      });
    pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", {
          configurable: true,
          value: true,
        });
      });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows all reviewed placeholders and captions while recordings are pending", () => {
    const { container } = render(
      <DemoGallery
        demos={landing.demos.desktop}
        pendingLabel={landing.demos.pendingLabel}
        placeholderAltPrefix={landing.demos.placeholderAltPrefix}
      />,
    );

    expect(screen.getByText("Save from anywhere")).toBeTruthy();
    expect(screen.getByText("Keep the context")).toBeTruthy();
    expect(screen.getByText("Rediscover it")).toBeTruthy();
    expect(screen.getByText(/one quick save gives it a place/i)).toBeTruthy();
    expect(screen.getAllByText("Recording pending review")).toHaveLength(3);
    expect(container.querySelectorAll(".demo-card__poster")).toHaveLength(3);
    expect(container.querySelectorAll("video")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("offers muted poster-first clips with accessible visitor controls", () => {
    const { container } = render(
      <DemoGallery
        demos={readyDemos}
        pendingLabel={landing.demos.pendingLabel}
        placeholderAltPrefix={landing.demos.placeholderAltPrefix}
      />,
    );
    const videos = [...container.querySelectorAll("video")];

    expect(videos).toHaveLength(3);
    expect(videos.every((video) => video.hasAttribute("poster"))).toBe(true);
    expect(
      videos.every((video) => video.getAttribute("preload") === "metadata"),
    ).toBe(true);
    expect(videos.every((video) => video.muted)).toBe(true);
    expect(videos.every((video) => video.playsInline)).toBe(true);
    expect(videos.every((video) => !video.hasAttribute("autoplay"))).toBe(true);
    expect(
      screen.getByRole("button", { name: /play save from anywhere/i }),
    ).toBeTruthy();
    expect(play).not.toHaveBeenCalled();
  });

  it("pauses the previous clip when a visitor starts another", async () => {
    const { container } = render(
      <DemoGallery
        demos={readyDemos}
        pendingLabel={landing.demos.pendingLabel}
        placeholderAltPrefix={landing.demos.placeholderAltPrefix}
      />,
    );
    const videos = [...container.querySelectorAll("video")];

    fireEvent.click(
      screen.getByRole("button", { name: /play save from anywhere/i }),
    );
    await waitFor(() => expect(videos[0]?.paused).toBe(false));

    fireEvent.click(
      screen.getByRole("button", { name: /play keep the context/i }),
    );
    await waitFor(() => expect(videos[0]?.paused).toBe(true));

    expect(videos[1]?.paused).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it("pauses a clip when it leaves the viewport", async () => {
    const { container } = render(
      <DemoGallery
        demos={readyDemos}
        pendingLabel={landing.demos.pendingLabel}
        placeholderAltPrefix={landing.demos.placeholderAltPrefix}
      />,
    );
    const video = container.querySelector("video");
    const observer = observers[0];

    fireEvent.click(
      screen.getByRole("button", { name: /play save from anywhere/i }),
    );
    await waitFor(() => expect(video?.paused).toBe(false));

    act(() => {
      const bounds = new DOMRectReadOnly(0, 0, 100, 100);
      observer?.callback(
        [
          {
            boundingClientRect: bounds,
            intersectionRect: bounds,
            intersectionRatio: 0,
            isIntersecting: false,
            rootBounds: null,
            target: video as HTMLVideoElement,
            time: 0,
          },
        ],
        observer as unknown as IntersectionObserver,
      );
    });

    await waitFor(() => expect(video?.paused).toBe(true));
  });
});
