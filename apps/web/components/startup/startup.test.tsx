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
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ships the logo, loading status, recovery link and script without hydration", () => {
    const html = renderToStaticMarkup(<StartupScreen />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading your library");
    // The stacked mark animates from inline CSS before any app code loads.
    expect(html).toContain('data-motion="enter loop"');
    expect(html).toContain("marka-stack-text");
    expect(html).toContain("@keyframes marka-stack-front-fan");
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

  it("fades out without blocking the ready app and stops motion during recovery", () => {
    const css = renderToStaticMarkup(<StartupScreen />);
    expect(css).toMatch(
      /html\[data-startup-ready="true"\] \.marka-startup \{\s*pointer-events: none;/,
    );
    expect(css).toContain(
      "@keyframes marka-startup-exit { to { opacity: 0; visibility: hidden; } }",
    );
    expect(css).toContain(
      "html[data-startup-recovery] .marka-startup-brand * { animation: none !important; }",
    );
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

  it("offers recovery on history restoration without declaring a stalled destination ready", () => {
    start();
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);
    expect(document.documentElement.dataset.startupReady).toBeUndefined();
    expect(document.documentElement.dataset.startupRecovery).toBe("slow");
    render(<StartupReady />);
    expect(document.documentElement.dataset.startupReady).toBe("true");
    expect(document.documentElement.dataset.startupRecovery).toBeUndefined();
  });

  it("releases content immediately and clears recovery when readiness arrives after a stall", () => {
    document.body.innerHTML =
      '<div id="marka-startup-content" inert><button>Destination</button></div>';
    start();
    vi.advanceTimersByTime(15000);
    expect(
      document.getElementById("marka-startup-content")?.hasAttribute("inert"),
    ).toBe(true);
    window.dispatchEvent(new Event("marka:startup-ready"));
    expect(
      document.getElementById("marka-startup-content")?.hasAttribute("inert"),
    ).toBe(false);
    expect(document.documentElement.dataset.startupRecovery).toBeUndefined();
  });

  it("does not replay on navigation, refresh events or resuming a ready document", () => {
    start();
    render(<StartupReady />);
    window.dispatchEvent(new Event("popstate"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    vi.advanceTimersByTime(30000);
    expect(document.documentElement.dataset.startupReady).toBe("true");
    expect(document.documentElement.dataset.startupRecovery).toBeUndefined();
  });

  it("does not arm recovery when the destination became ready before the inline script", () => {
    render(<StartupReady />);
    start();
    expect(vi.getTimerCount()).toBe(0);
  });
});
