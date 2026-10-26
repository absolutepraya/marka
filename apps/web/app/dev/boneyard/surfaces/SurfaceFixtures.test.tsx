// @vitest-environment jsdom

import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurfaceFixture, surfaceNames } from "./SurfaceFixtures";
import type { ResponsiveBones } from "boneyard-js";

const captures = Object.fromEntries(
  surfaceNames.map((name) => [
    name,
    JSON.parse(
      readFileSync(
        resolve("components/loading-ui/bones", `${name}.bones.json`),
        "utf8",
      ),
    ) as ResponsiveBones,
  ]),
);

vi.hoisted(async () => {
  vi.stubGlobal("React", await import("react"));
});

vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => {
    throw new Error(
      "Capture fixtures must not mount query or mutation controllers",
    );
  },
}));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/boneyard/surfaces",
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("synthetic content capture boundaries", () => {
  it.each(surfaceNames)(
    "has valid generated geometry for %s at every capture width",
    (name) => {
      const capture = captures[name];
      for (const width of [320, 390, 640, 768, 1023, 1024, 1280, 1440, 1920]) {
        const sample = capture.breakpoints[width];
        expect(sample.width).toBeGreaterThan(0);
        expect(sample.height).toBeGreaterThan(0);
        expect(sample.bones.length).toBeGreaterThan(0);
      }
    },
  );
  it.each(surfaceNames)(
    "renders %s without fetching data or invoking mutations",
    (name) => {
      const view = render(
        <TooltipProvider>
          <SurfaceFixture name={name} />
        </TooltipProvider>,
      );
      expect(view.container.textContent?.length).toBeGreaterThan(0);
      expect(
        view.container.querySelector("[data-content-skeleton]"),
      ).toBeNull();
    },
  );
});
