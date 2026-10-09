// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startupScript } from "./startup-script";
import StartupReady from "./StartupReady";
import StartupScreen from "./StartupScreen";

function start() {
  // Execute exactly the script shipped in the first server-rendered HTML.
  new Function(startupScript)();
}

describe("mobile startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete document.documentElement.dataset.startupReady;
    delete document.documentElement.dataset.startupRecovery;
    delete document.documentElement.dataset.startupTheme;
    document.cookie = "theme=; max-age=0";
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null) });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    window.dispatchEvent(new Event("marka:startup-ready"));
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ships the logo, loading status, recovery link and script without hydration", () => {
    const html = renderToStaticMarkup(<StartupScreen />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading your library");
    expect(html).toContain("marka-wordmark-navy.png");
    expect(html).toContain("marka-wordmark-white.png");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain('id="marka-startup-retry"');
    expect(html).toContain("<script>");
    expect(html).toContain("Enable JavaScript");
  });

  it("honors the theme cookie ahead of local storage, matching the theme provider", () => {
    document.cookie = "theme=light";
    vi.mocked(localStorage.getItem).mockReturnValue("dark");
    start();
    expect(document.documentElement.dataset.startupTheme).toBe("light");
  });

  it("uses the saved theme before app providers arrive", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("dark");
    start();
    expect(document.documentElement.dataset.startupTheme).toBe("dark");
  });

  it("still offers recovery when storage is unavailable", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("blocked");
    });
    start();
    vi.advanceTimersByTime(15000);
    expect(document.documentElement.dataset.startupRecovery).toBe("slow");
  });

  it("dismisses immediately on destination hydration and cancels recovery", () => {
    start();
    render(<StartupReady />);
    expect(document.documentElement.dataset.startupReady).toBe("true");
    act(() => vi.advanceTimersByTime(30000));
    expect(document.documentElement.dataset.startupRecovery).toBeUndefined();
  });

  it("offers offline recovery without falsely declaring readiness", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    start();
    vi.advanceTimersByTime(15000);
    expect(document.documentElement.dataset.startupRecovery).toBe("offline");
    expect(document.documentElement.dataset.startupReady).toBeUndefined();
    render(<StartupReady />);
    expect(document.documentElement.dataset.startupReady).toBe("true");
  });

  it("dismisses a stale startup screen on back-forward cache restoration", () => {
    start();
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    expect(document.documentElement.dataset.startupReady).toBe("true");
    vi.advanceTimersByTime(30000);
    expect(document.documentElement.dataset.startupRecovery).toBeUndefined();
  });
});
