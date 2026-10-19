// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionButton, ActionButtonWithTooltip } from "./action-button";
import { Button, ButtonWithTooltip } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Toaster } from "./sonner";
import { TooltipProvider } from "./tooltip";

vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));

vi.mock("@teispace/next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));
vi.mock("sonner", () => ({
  Toaster: ({ className }: { className?: string }) => (
    <div data-testid="toaster" className={className} />
  ),
  toast: vi.fn(),
}));

afterEach(cleanup);

describe("shared action controls", () => {
  it("keeps an action's name and disables repeat submission while loading", () => {
    const submit = vi.fn();
    render(
      <ActionButton loading onClick={submit}>
        Save changes
      </ActionButton>,
    );
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
  });

  it("restores the action after loading", () => {
    const submit = vi.fn();
    const { rerender } = render(<ActionButton loading>Save</ActionButton>);
    rerender(
      <ActionButton loading={false} onClick={submit}>
        Save
      </ActionButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("names icon controls from their tooltip and permits an explicit override", () => {
    render(
      <TooltipProvider>
        <ButtonWithTooltip tooltip="Sort bookmarks">
          <svg />
        </ButtonWithTooltip>
        <ActionButtonWithTooltip
          tooltip="Delete"
          aria-label="Delete bookmark"
          loading
        >
          <svg />
        </ActionButtonWithTooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Sort bookmarks" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete bookmark" }),
    ).toBeTruthy();
  });

  it("preserves a slotted link and its name while busy", () => {
    render(
      <ActionButton asChild loading>
        <a href="https://example.com/export">Export library</a>
      </ActionButton>,
    );
    expect(
      screen
        .getByRole("link", { name: "Export library" })
        .getAttribute("aria-busy"),
    ).toBe("true");
  });

  it.each([
    { loading: true, disabled: false },
    { loading: false, disabled: true },
  ])("blocks slotted link activation with %j", (state) => {
    const childClick = vi.fn();
    const parentClick = vi.fn();
    const childKey = vi.fn();
    const parentKey = vi.fn();
    const childCapture = vi.fn();
    const parentCapture = vi.fn();
    render(
      <ActionButton
        asChild
        {...state}
        onClick={parentClick}
        onKeyDown={parentKey}
        onClickCapture={parentCapture}
      >
        <a
          href="#export"
          onClick={childClick}
          onKeyDown={childKey}
          onClickCapture={childCapture}
        >
          Export library
        </a>
      </ActionButton>,
    );
    const link = screen.getByRole("link", { name: "Export library" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.tabIndex).toBe(-1);
    expect(fireEvent.click(link)).toBe(false);
    expect(
      fireEvent(
        link,
        new MouseEvent("auxclick", {
          button: 1,
          bubbles: true,
          cancelable: true,
        }),
      ),
    ).toBe(false);
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(link, { key: " " })).toBe(false);
    for (const handler of [
      childClick,
      parentClick,
      childKey,
      parentKey,
      childCapture,
      parentCapture,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it("restores a slotted link's handlers and tab stop after loading", () => {
    const childClick = vi.fn();
    const parentClick = vi.fn();
    const childKey = vi.fn();
    const parentKey = vi.fn();
    const childCapture = vi.fn();
    const parentCapture = vi.fn();
    const renderLink = (loading: boolean) => (
      <ActionButton
        asChild
        loading={loading}
        onClick={parentClick}
        onKeyDown={parentKey}
        onClickCapture={parentCapture}
      >
        <a
          href="#export"
          onClick={childClick}
          onKeyDown={childKey}
          onClickCapture={childCapture}
        >
          Export library
        </a>
      </ActionButton>
    );
    const { rerender } = render(renderLink(true));
    rerender(renderLink(false));
    const link = screen.getByRole("link", { name: "Export library" });
    expect(link.getAttribute("aria-disabled")).toBeNull();
    expect(link.tabIndex).toBe(0);
    expect(fireEvent.click(link)).toBe(true);
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(true);
    for (const handler of [
      childClick,
      parentClick,
      childKey,
      parentKey,
      childCapture,
      parentCapture,
    ]) {
      expect(handler).toHaveBeenCalledOnce();
    }
  });

  it("allows caller sizing to override shared defaults", () => {
    render(
      <Button size="icon" className="size-8">
        Edit
      </Button>,
    );
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("size-8");
    expect(classes).not.toContain("size-10");
  });
});

describe("shared choice menus", () => {
  it("exposes the current choice and preserves a menu when a setting requests it", () => {
    const change = vi.fn();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button>View</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="grid" onValueChange={change}>
            <DropdownMenuRadioItem value="grid">Grid</DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="list"
              onSelect={(event) => event.preventDefault()}
            >
              List
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(
      screen
        .getByRole("menuitemradio", { name: "Grid" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "List" }));
    expect(change).toHaveBeenCalledWith("list");
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

it("keeps toast theme hooks when a caller supplies positioning classes", () => {
  render(<Toaster className="mobile-nav-toast-offset" />);
  const classes = screen.getByTestId("toaster").className.split(" ");
  expect(classes).toContain("toaster");
  expect(classes).toContain("group");
  expect(classes).toContain("mobile-nav-toast-offset");
});
