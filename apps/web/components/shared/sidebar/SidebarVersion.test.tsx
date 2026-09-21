// @vitest-environment jsdom

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SidebarVersion from "./SidebarVersion";
import type { PwaUpdateStatus } from "@/components/pwa/ServiceWorkerRegistration";

const mocks = vi.hoisted(() => ({
  lifecycle: {
    appBuild: "aaaaaaa",
    deployedBuild: "bbbbbbb" as string | null,
    updateStatus: "ready" as PwaUpdateStatus,
    updateAvailable: true,
    checkForUpdate: vi.fn(),
    activateUpdate: vi.fn(),
  },
  clientConfig: {
    serverRelease: undefined as string | undefined,
    serverCommitShort: undefined as string | undefined,
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/pwa/ServiceWorkerRegistration", () => ({
  usePwaLifecycle: () => mocks.lifecycle,
}));

vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => mocks.clientConfig,
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { build?: string }) => {
      const translations: Record<string, string> = {
        build: `Build ${values?.build ?? ""}`,
        update_available: `Update available · ${values?.build ?? ""}`,
        update_ready: `Update ready · ${values?.build ?? ""}`,
        update_now: "Update now",
        up_to_date: "Up to date",
        checking: "Checking...",
        preparing_update: "Preparing update...",
        updating: "Updating...",
        close_other_tabs: "Close other tabs to update",
        check_failed: "Check failed",
        update_unavailable: "Update unavailable",
      };
      return translations[key] ?? key;
    },
  }),
}));

describe("SidebarVersion", () => {
  beforeEach(() => {
    mocks.lifecycle.appBuild = "aaaaaaa";
    mocks.lifecycle.deployedBuild = "bbbbbbb";
    mocks.lifecycle.updateStatus = "ready";
    mocks.lifecycle.updateAvailable = true;
    mocks.lifecycle.activateUpdate.mockReset();
    mocks.lifecycle.checkForUpdate.mockReset();
    mocks.clientConfig.serverRelease = undefined;
    mocks.clientConfig.serverCommitShort = undefined;
  });

  it("shows the running app build and a ready deployed update", () => {
    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build aaaaaaa");
    expect(container.textContent).toContain("Update now");
    expect(container.querySelector("button")).not.toBeNull();
    fireEvent.click(container.querySelector("button")!);
    expect(mocks.lifecycle.activateUpdate).toHaveBeenCalledOnce();

    const buildLink = container.querySelector(
      'a[href="https://github.com/absolutepraya/marka/commit/aaaaaaa"]',
    );
    expect(buildLink).not.toBeNull();
    expect(
      container.querySelector(
        'a[href="https://github.com/absolutepraya/marka"]',
      ),
    ).toBeNull();
  });

  it("shows the release and short commit when release metadata is available", () => {
    mocks.clientConfig.serverRelease = "0.1.0";
    mocks.clientConfig.serverCommitShort = "aaaaaaa";

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build v0.1.0 · aaaaaaa");
  });

  it("shows an available update before its worker is ready", () => {
    mocks.lifecycle.updateStatus = "available";
    mocks.lifecycle.updateAvailable = true;

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build aaaaaaa");
    expect(container.textContent).toContain("Preparing update...");
    expect(container.textContent).not.toContain("Update ready");
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows a checking state while manually refreshing", () => {
    mocks.lifecycle.updateStatus = "checking";
    mocks.lifecycle.updateAvailable = false;

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Checking...");
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows unavailable for an invalid running build", () => {
    mocks.lifecycle.appBuild = "development";
    mocks.lifecycle.deployedBuild = "bbbbbbb";
    mocks.lifecycle.updateStatus = "unavailable";
    mocks.lifecycle.updateAvailable = false;

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build development");
    expect(container.textContent).toContain("Update unavailable");
    expect(container.querySelector("button")).toBeNull();

    const unavailable = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "Update unavailable",
    );
    expect(unavailable?.className).toBe("text-muted-foreground");
  });

  it("does not show an update line when the deployed build matches", () => {
    mocks.lifecycle.deployedBuild = "aaaaaaa";
    mocks.lifecycle.updateStatus = "current";
    mocks.lifecycle.updateAvailable = false;

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build aaaaaaa");
    expect(container.textContent).not.toContain("Update available");
    expect(container.textContent).not.toContain("Update ready");
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("renders a non-SHA build without a commit link", () => {
    mocks.lifecycle.appBuild = "development";
    mocks.lifecycle.deployedBuild = "development";
    mocks.lifecycle.updateStatus = "current";
    mocks.lifecycle.updateAvailable = false;

    const { container } = render(<SidebarVersion />);

    expect(container.textContent).toContain("Build development");
    expect(container.querySelector('a[href*="/commit/"]')).toBeNull();
  });

  it("keeps the profile build footer small and subdued", () => {
    const { container } = render(<SidebarVersion placement="profile" />);

    const buildLink = container.querySelector('a[href*="/commit/"]');
    expect(buildLink?.className).toContain("text-[11px]");
    expect(buildLink?.className).toContain("opacity-50");
    expect(buildLink?.querySelector("svg")?.className.baseVal).toContain(
      "size-3",
    );
  });
});
