// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/dashboard/bookmarks",
  pending: false,
  savePosition: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: navigation.pending }),
  default: ({
    onNavigate,
    onClick,
    href,
    children,
    prefetch: _prefetch,
    scroll: _scroll,
    ...props
  }: React.ComponentProps<"a"> & {
    onNavigate?: () => void;
    prefetch?: boolean;
    scroll?: boolean;
  }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        onNavigate?.();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("./MobileTabNavigation", () => ({
  useSaveTabPosition: () => navigation.savePosition,
}));

import MobileNavSelection from "./MobileNavSelection";
import MobileSidebarItem from "./ModileSidebarItem";

function Navbar() {
  return (
    <MobileNavSelection>
      <ul>
        <MobileSidebarItem
          name="Home"
          logo={<svg />}
          path="/dashboard/bookmarks"
        />
        <MobileSidebarItem name="Tags" logo={<svg />} path="/dashboard/tags" />
      </ul>
    </MobileNavSelection>
  );
}

beforeEach(() => {
  navigation.pathname = "/dashboard/bookmarks";
  navigation.pending = false;
  navigation.savePosition.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mobile navbar selection", () => {
  it("selects the destination immediately and preserves scroll saving", () => {
    render(<Navbar />);
    fireEvent.click(screen.getByRole("link", { name: "Tags" }));
    expect(
      screen.getByRole("link", { name: "Tags" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current"),
    ).toBe(false);
    expect(navigation.savePosition).toHaveBeenCalledOnce();
  });

  it("restores the current route when pending navigation ends without a route change", () => {
    const view = render(<Navbar />);
    fireEvent.click(screen.getByRole("link", { name: "Tags" }));
    navigation.pending = true;
    view.rerender(<Navbar />);
    expect(
      screen
        .getByRole("link", { name: "Tags" })
        .querySelector('[aria-busy="true"]'),
    ).toBeTruthy();
    navigation.pending = false;
    view.rerender(<Navbar />);
    expect(
      screen.getByRole("link", { name: "Home" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Tags" }).hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("keeps a section selected on its nested pages after navigation completes", () => {
    const view = render(<Navbar />);
    fireEvent.click(screen.getByRole("link", { name: "Tags" }));
    navigation.pathname = "/dashboard/tags/example";
    view.rerender(<Navbar />);
    expect(
      screen.getByRole("link", { name: "Tags" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current"),
    ).toBe(false);
  });
});

describe("loading underline", () => {
  function mockAnimation(elapsed: number) {
    const cancel = vi.fn();
    const animate = vi.fn(
      (_frames: Keyframe[], _options: KeyframeAnimationOptions) =>
        ({ currentTime: elapsed, cancel }) as unknown as Animation,
    );
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    return { animate, cancel };
  }

  it("delays motion by 200ms and skips settling for a quick load", () => {
    const { animate, cancel } = mockAnimation(150);
    const view = render(<Navbar />);
    navigation.pending = true;
    view.rerender(<Navbar />);
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0][1]).toMatchObject({
      delay: 200,
      duration: 600,
    });
    navigation.pending = false;
    view.rerender(<Navbar />);
    expect(cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
  });

  it("settles the moving endpoints to full width when a longer load ends", () => {
    const { animate } = mockAnimation(350);
    const view = render(<Navbar />);
    navigation.pending = true;
    view.rerender(<Navbar />);
    const underline = screen
      .getByRole("link", { name: "Home" })
      .querySelector('[aria-hidden="true"]') as HTMLElement;
    underline.style.left = "18px";
    underline.style.right = "0px";
    navigation.pending = false;
    view.rerender(<Navbar />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[1]).toEqual([
      [
        { left: "18px", right: "0px" },
        { left: "0px", right: "0px" },
      ],
      { duration: 180, easing: "ease-out" },
    ]);
  });
});
