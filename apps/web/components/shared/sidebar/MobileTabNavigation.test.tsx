// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard/bookmarks",
  prefetch: vi.fn(),
  options: vi.fn((input) => ({ queryKey: [input] })),
}));
const api = {
  bookmarks: { getBookmarks: { infiniteQueryOptions: mocks.options } },
  tags: { list: { infiniteQueryOptions: mocks.options } },
};
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/store/useSortOrderStore", () => ({
  useSortOrderStore: () => "desc",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ prefetchInfiniteQuery: mocks.prefetch }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({ useTRPC: () => api }));

import MobileTabNavigation, { useSaveTabPosition } from "./MobileTabNavigation";

function LeaveTab() {
  const save = useSaveTabPosition();
  return <button onClick={save}>Leave tab</button>;
}
function Tabs() {
  return (
    <MobileTabNavigation>
      <LeaveTab />
      <main>Content</main>
    </MobileTabNavigation>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.pathname = "/dashboard/bookmarks";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("mobile tab navigation", () => {
  it("restores Home's position after visiting another tab", () => {
    const view = render(<Tabs />);
    act(() => vi.advanceTimersByTime(20));
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 640,
    });
    fireEvent.click(screen.getByRole("button", { name: "Leave tab" }));
    mocks.pathname = "/dashboard/lists";
    view.rerender(<Tabs />);
    act(() => vi.advanceTimersByTime(20));
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 0,
      behavior: "instant",
    });
    mocks.pathname = "/dashboard/bookmarks";
    view.rerender(<Tabs />);
    act(() => vi.advanceTimersByTime(20));
    expect(window.scrollTo).toHaveBeenLastCalledWith({
      top: 640,
      behavior: "instant",
    });
  });

  it("does not warm queries when mobile data saving is enabled", () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    render(<Tabs />);
    act(() => vi.advanceTimersByTime(1500));
    expect(mocks.prefetch).not.toHaveBeenCalled();
  });

  it("warms both bookmark tabs and the three tag sections after startup", () => {
    render(<Tabs />);
    expect(mocks.prefetch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.prefetch).toHaveBeenCalledTimes(5);
  });
});
