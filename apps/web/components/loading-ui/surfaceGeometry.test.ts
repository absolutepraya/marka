import { describe, expect, it } from "vitest";
import type { ResponsiveBones, SkeletonResult } from "boneyard-js";
import { selectSurfaceCapture } from "./surfaceGeometry";

function sample(width: number, viewportWidth: number): SkeletonResult {
  return {
    name: "fixture",
    width,
    viewportWidth,
    height: viewportWidth < 640 ? 400 : 160,
    bones: [[0, 0, 50, 20, 4]],
  };
}
const bones: ResponsiveBones = {
  breakpoints: {
    320: sample(288, 320),
    390: sample(358, 390),
    640: sample(344, 640),
    1440: sample(896, 1440),
  },
};
describe("surface capture selection", () => {
  it("waits for client measurement before replacing the server fallback", () => {
    expect(selectSurfaceCapture(bones, 0, 390)).toBeUndefined();
    expect(selectSurfaceCapture(bones, 350, 0)).toBeUndefined();
  });
  it("keeps mobile and desktop styles separate at the same content width", () => {
    expect(selectSurfaceCapture(bones, 350, 390)).toBe(bones.breakpoints[390]);
    expect(selectSurfaceCapture(bones, 350, 640)).toBe(bones.breakpoints[640]);
  });
  it("selects by actual container width when the viewport stays wide", () => {
    expect(selectSurfaceCapture(bones, 890, 1440)).toBe(
      bones.breakpoints[1440],
    );
    expect(selectSurfaceCapture(bones, 350, 1440)).toBe(bones.breakpoints[640]);
  });
  it("uses viewport proximity for equal-width centered columns", () => {
    const wide = sample(896, 1920);
    expect(
      selectSurfaceCapture(
        { breakpoints: { ...bones.breakpoints, 1920: wide } },
        896,
        1920,
      ),
    ).toBe(wide);
  });
  it("does not invent geometry for an empty capture set", () => {
    expect(selectSurfaceCapture({ breakpoints: {} }, 350, 390)).toBeUndefined();
  });
});
