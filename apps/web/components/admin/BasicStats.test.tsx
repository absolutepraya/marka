// @vitest-environment jsdom

import React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import english from "@/lib/i18n/locales/en/translation.json";
import french from "@/lib/i18n/locales/fr/translation.json";

import BasicStats from "./BasicStats";
import BasicStatsSkeleton from "./BasicStatsSkeleton";
import bones from "./bones/admin-stats.bones.json";

const queryState = vi.hoisted(() => ({
  stats: undefined as { numUsers: number; numBookmarks: number } | undefined,
  language: "en" as "en" | "fr",
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "admin-stats" ? queryState.stats : undefined,
  }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    admin: { stats: { queryOptions: () => ({ queryKey: ["admin-stats"] }) } },
  }),
}));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({
    disableNewReleaseCheck: true,
    serverVersion: "1.2.3",
    serverRelease: "1.2.3",
  }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common.loading") return "Chargement…";
      if (key === "admin.server_stats.description") {
        return (queryState.language === "fr" ? french : english).admin
          .server_stats.description;
      }
      return key;
    },
  }),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  queryState.stats = undefined;
  queryState.language = "en";
  vi.stubGlobal(
    "ResizeObserver",
    class {
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
  vi.unstubAllGlobals();
});

describe("admin statistics skeleton", () => {
  it("updates the description with the selected language", () => {
    queryState.stats = { numUsers: 7, numBookmarks: 2468 };
    const view = render(<BasicStats />);
    expect(view.getByText(english.admin.server_stats.description)).toBeTruthy();
    queryState.language = "fr";
    view.rerender(<BasicStats />);
    expect(view.getByText(french.admin.server_stats.description)).toBeTruthy();
    expect(view.queryByText(english.admin.server_stats.description)).toBeNull();
  });
  it("keeps a translated announcement and visible fallback in server HTML", () => {
    const html = renderToString(<BasicStatsSkeleton />);
    expect(html).toContain('aria-label="Chargement…"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("data-boneyard-bone=");
  });

  it("renders captured bones after hydration, then reveals the real statistics", () => {
    const view = render(<BasicStats />);
    expect(view.getByRole("status", { name: "Chargement…" })).toBeTruthy();
    expect(
      view.container.querySelectorAll("[data-boneyard-bone]").length,
    ).toBeGreaterThan(0);

    queryState.stats = { numUsers: 7, numBookmarks: 2468 };
    view.rerender(<BasicStats />);
    expect(view.queryByRole("status")).toBeNull();
    expect(view.container.querySelector("[data-boneyard]")).toBeNull();
    expect(view.getByText("7")).toBeTruthy();
    expect(view.getByText("2468")).toBeTruthy();
    expect(view.getByText("v1.2.3")).toBeTruthy();
  });

  it("captures the shared view with synthetic data in build mode", () => {
    vi.stubGlobal("__BONEYARD_BUILD", true);
    const view = render(<BasicStatsSkeleton />);
    expect(view.getByText("12")).toBeTruthy();
    expect(view.getByText("1234")).toBeTruthy();
    expect(view.getByText("v1.2.3")).toBeTruthy();
    expect(view.container.querySelector("[data-boneyard-bone]")).toBeNull();
  });

  it("uses the mobile capture height after resizing a desktop skeleton", () => {
    vi.stubGlobal("innerWidth", 1440);
    const view = render(<BasicStatsSkeleton />);
    const desktop = view.container.querySelector("[data-boneyard]")!;
    expect((desktop.parentElement as HTMLElement).style.height).toBe(
      `${bones.breakpoints["1440"].height}px`,
    );

    act(() => {
      vi.stubGlobal("innerWidth", 390);
      window.dispatchEvent(new Event("resize"));
    });
    const mobile = view.container.querySelector("[data-boneyard]")!;
    expect(mobile).not.toBe(desktop);
    expect((mobile.parentElement as HTMLElement).style.height).toBe(
      `${bones.breakpoints["390"].height}px`,
    );
  });

  it("has nonempty captures for mobile and both sides of the desktop layout switch", () => {
    for (const width of ["320", "390", "1023", "1024", "1440"] as const) {
      const capture = bones.breakpoints[width];
      expect(capture.width).toBeGreaterThan(0);
      expect(capture.height).toBeGreaterThan(0);
      expect(capture.bones.length).toBeGreaterThan(0);
    }
    expect(bones.breakpoints["1023"].height).toBeGreaterThan(
      bones.breakpoints["1024"].height,
    );
  });
});
