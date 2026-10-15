// @vitest-environment jsdom

import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ActionConfirmingDialog from "./action-confirming-dialog";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  revealFocusedTextEntry,
} from "./dialog";

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

class MockVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
}

function setDimensions(
  element: HTMLElement,
  {
    clientHeight,
    scrollHeight,
    scrollTop = 0,
  }: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop?: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
    scrollTop: { configurable: true, value: scrollTop, writable: true },
  });
}

function setRect(element: Element, top: number, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, top, 320, height),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
});

describe("revealFocusedTextEntry", () => {
  it("rechecks the focused field after the first keyboard viewport event is missed", () => {
    vi.useFakeTimers();
    const viewport = new MockVisualViewport();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });

    const view = render(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(
          DialogContent,
          null,
          React.createElement(DialogTitle, null, "Add bookmark"),
          React.createElement(
            DialogDescription,
            null,
            "Choose where to save the bookmark.",
          ),
          React.createElement("input", { "aria-label": "Search lists" }),
        ),
      ),
    );
    const dialog = view.getByRole("dialog");
    const input = view.getByRole("textbox", { name: "Search lists" });
    dialog.style.overflowY = "auto";
    setDimensions(dialog, { clientHeight: 400, scrollHeight: 1000 });
    setRect(dialog, 0, 400);
    setRect(input, 520, 32);

    act(() => input.focus());
    act(() => {
      animationFrames.shift()?.(0);
      animationFrames.shift()?.(0);
    });

    // iOS can report the keyboard resize before the dialog's viewport listener
    // is subscribed. The initial focus frames therefore see the old viewport.
    viewport.height = 500;
    act(() => vi.advanceTimersByTime(350));

    expect(dialog.scrollTop).toBe(64);
  });

  it("scrolls a modal just enough to keep a focused field above the keyboard", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { height: 500, offsetTop: 0 },
    });

    const dialog = document.createElement("div");
    const input = document.createElement("input");
    dialog.style.overflowY = "auto";
    dialog.append(input);
    document.body.append(dialog);
    setDimensions(dialog, { clientHeight: 400, scrollHeight: 1000 });
    setRect(dialog, 0, 400);
    setRect(input, 520, 32);

    revealFocusedTextEntry(dialog, input);

    expect(dialog.scrollTop).toBe(64);
  });

  it("reveals a field above overlapping sticky dialog chrome", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { height: 600, offsetTop: 0 },
    });

    const dialog = document.createElement("div");
    const input = document.createElement("textarea");
    const footer = document.createElement("footer");
    dialog.style.overflowY = "auto";
    footer.style.position = "sticky";
    dialog.append(input, footer);
    document.body.append(dialog);
    setDimensions(dialog, { clientHeight: 600, scrollHeight: 1200 });
    setRect(dialog, 0, 600);
    setRect(input, 440, 32);
    setRect(footer, 430, 64);

    revealFocusedTextEntry(dialog, input);

    expect(dialog.scrollTop).toBe(54);
  });

  it("uses the closest scrollable modal container before its ancestor", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: { height: 600, offsetTop: 0 },
    });

    const dialog = document.createElement("div");
    const nestedScroller = document.createElement("div");
    const input = document.createElement("input");
    dialog.style.overflowY = "auto";
    nestedScroller.style.overflowY = "auto";
    nestedScroller.append(input);
    dialog.append(nestedScroller);
    document.body.append(dialog);
    setDimensions(dialog, { clientHeight: 500, scrollHeight: 1000 });
    setDimensions(nestedScroller, { clientHeight: 400, scrollHeight: 900 });
    setRect(dialog, 0, 500);
    setRect(input, 620, 32);

    revealFocusedTextEntry(dialog, input);

    expect(nestedScroller.scrollTop).toBe(64);
    expect(dialog.scrollTop).toBe(0);
  });
});

describe("DialogContent bottom sheets", () => {
  it("marks bottom sheets for gesture-handle safe space", () => {
    const view = render(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(
          DialogContent,
          { position: "bottom" },
          React.createElement(DialogTitle, null, "Bottom sheet"),
          React.createElement(
            DialogDescription,
            null,
            "Bottom sheet description",
          ),
        ),
      ),
    );

    expect(view.getByRole("dialog").className).toContain(
      "dialog-vv-bottom-safe-area",
    );
  });
});

describe("DialogFooter equal action columns", () => {
  it("keeps ActionConfirmingDialog actions in equal, wrapping tracks", () => {
    const view = render(
      React.createElement(ActionConfirmingDialog, {
        open: true,
        title: "Delete item",
        description: "This action cannot be undone.",
        actionButton: () =>
          React.createElement("button", { type: "button" }, "Delete"),
      }),
    );

    const dialog = view.getByRole("dialog");
    const footer = Array.from(dialog.querySelectorAll("div")).find(
      (element) =>
        (element as HTMLDivElement).style.gridTemplateColumns ===
        "repeat(2, minmax(0, 1fr))",
    ) as HTMLDivElement;

    expect(footer).toBeTruthy();
    expect(footer.className).toContain("[&_button]:h-full");
    expect(footer.className).toContain("[&_button]:min-h-11");
    expect(footer.className).toContain("[&_button]:whitespace-normal");
    expect(footer.className).toContain("[&_button]:[overflow-wrap:anywhere]");
    expect(view.getByRole("button", { name: "actions.cancel" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("supports three equal tracks without forcing two columns", () => {
    const view = render(
      React.createElement(
        DialogFooter,
        { equalColumns: 3 },
        React.createElement("button", null, "One"),
        React.createElement("button", null, "Two"),
        React.createElement("button", null, "Three"),
      ),
    );
    const footer = view.container.firstElementChild as HTMLDivElement;
    expect(footer.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    view.unmount();

    const defaultLayout = render(
      React.createElement(
        DialogFooter,
        null,
        React.createElement("button", null, "Close"),
        React.createElement("button", null, "Save"),
        React.createElement("button", null, "Delete"),
      ),
    );
    expect(
      (defaultLayout.container.firstElementChild as HTMLDivElement).style
        .gridTemplateColumns,
    ).toBe("");
    expect(defaultLayout.container.firstElementChild?.className).toContain(
      "flex-col-reverse",
    );
  });
});
