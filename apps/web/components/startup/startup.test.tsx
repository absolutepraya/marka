// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/lib/i18n/locales/en/translation.json";
import fr from "@/lib/i18n/locales/fr/translation.json";
import { useTranslation } from "@/lib/i18n/server";

vi.mock("@/lib/userLocalSettings/userLocalSettings", () => ({
  getUserLocalSettings: vi.fn(async () => ({ lang: "fr" })),
}));

import { startupScript } from "./startup-script";
import StartupReady from "./StartupReady";
import StartupScreen from "./StartupScreen";

const startupKeys = Object.keys(en.startup) as (keyof typeof en.startup)[];

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
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });

  it.each(["slow", "offline"] as const)(
    "updates the same visible status region for %s recovery before hydration",
    (recovery) => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: recovery !== "offline",
      });
      render(<StartupScreen messages={fr.startup} />);
      const region = document.querySelector('[role="status"]');
      expect(region?.textContent).toContain(fr.startup.loading);
      start();
      act(() => vi.advanceTimersByTime(15000));
      expect(document.querySelector('[role="status"]')).toBe(region);
      expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(region?.textContent).toContain(fr.startup[recovery]);
      expect(region?.textContent).not.toContain(fr.startup.loading);
      expect(document.documentElement.dataset.startupReady).toBeUndefined();
      const css = document.querySelector("style")?.textContent;
      expect(css).not.toContain(".marka-startup-status { display: none; }");
    },
  );

  it("renders all startup copy from server translations without client providers", async () => {
    vi.useRealTimers();
    const { t } = await useTranslation("fr");
    const messages = Object.fromEntries(
      startupKeys.map((key) => [key, t(`startup.${key}`)]),
    ) as typeof en.startup;
    const html = renderToStaticMarkup(<StartupScreen messages={messages} />);
    expect(messages).toEqual(fr.startup);
    expect(html).toContain(fr.startup.loading);
    expect(html).toContain(fr.startup.retry);
    expect(html).toContain(fr.startup.noScript);
    expect(html).toContain(`aria-label="${fr.startup.label}"`);
  });

  it("falls back to English when the selected locale has no startup translations", async () => {
    vi.useRealTimers();
    const { t } = await useTranslation("de");
    for (const key of startupKeys) {
      expect(t(`startup.${key}`)).toBe(en.startup[key]);
    }
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
