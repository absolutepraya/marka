// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MARKA_STACK_CSS,
  MarkaStackLoader,
  MarkaStackMark,
} from "./marka-stack";

afterEach(cleanup);

describe("Marka stack loader", () => {
  it("announces loading once and draws both cards", () => {
    const { getByRole } = render(<MarkaStackLoader label="Loading rules" />);
    const status = getByRole("status", { name: "Loading rules" });
    const svg = status.querySelector("svg.marka-stack")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("data-motion")).toBe("loop");
    expect(svg.querySelectorAll("path.marka-stack-back")).toHaveLength(1);
    // The visible front card plus the gap it cuts into the rear card.
    expect(svg.querySelectorAll(".marka-stack-front")).toHaveLength(2);
  });

  it("masks each rear card with its own instance's gap", () => {
    const { container } = render(
      <>
        <MarkaStackMark />
        <MarkaStackMark />
      </>,
    );
    const ids = [...container.querySelectorAll("mask")].map((mask) => mask.id);
    expect(new Set(ids).size).toBe(2);
    container.querySelectorAll("svg").forEach((svg, index) => {
      const back = svg.querySelector(".marka-stack-back")!;
      expect(back.getAttribute("mask")).toBe(`url(#${ids[index]})`);
      // The gap moves with the front card, so it must share its pivot.
      expect(svg.querySelector("mask .marka-stack-front")).not.toBeNull();
    });
  });

  it("animates only for people who have not asked for reduced motion", () => {
    const start = MARKA_STACK_CSS.indexOf(
      "@media (prefers-reduced-motion: no-preference) {",
    );
    const end = MARKA_STACK_CSS.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(-1);
    const outside =
      MARKA_STACK_CSS.slice(0, start) + MARKA_STACK_CSS.slice(end);
    expect(outside).not.toMatch(/animation\s*:/);
    expect(outside).not.toMatch(/mask-image\s*:/);
  });
});
