// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Draggable from "react-draggable";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TagPillContent } from "./TagPill";

vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tag pill drag boundary", () => {
  it("forwards the draggable ref, handlers, styles and classes to the DOM", () => {
    const ref = React.createRef<HTMLDivElement>();
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
      <Draggable nodeRef={ref} onStart={onStart} onStop={onStop}>
        <TagPillContent ref={ref} id="reading" name="Reading" count={3} />
      </Draggable>,
    );
    const pill = ref.current!;
    expect(pill.className).toContain("react-draggable");
    expect(pill.style.transform).toBe("translate(0px,0px)");
    fireEvent.mouseDown(pill, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 40, clientY: 30 });
    expect(onStart).toHaveBeenCalledOnce();
    expect(pill.className).toContain("react-draggable-dragging");
    expect(pill.style.transform).toBe("translate(30px,20px)");
    fireEvent.mouseUp(document);
    expect(onStop).toHaveBeenCalledOnce();
  });
});
