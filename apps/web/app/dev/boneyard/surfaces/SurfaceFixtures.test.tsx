// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurfaceFixture, surfaceNames } from "./SurfaceFixtures";

vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => {
    throw new Error(
      "Capture fixtures must not mount query or mutation controllers",
    );
  },
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dev/boneyard/surfaces",
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("synthetic content capture boundaries", () => {
  it.each(surfaceNames)(
    "renders %s without fetching data or invoking mutations",
    (name) => {
      const view = render(<SurfaceFixture name={name} />);
      expect(view.container.textContent?.length).toBeGreaterThan(0);
      expect(
        view.container.querySelector("[data-content-skeleton]"),
      ).toBeNull();
    },
  );
});
