import { describe, expect, it } from "vitest";
import captures from "./bones/bookmark-cards.bones.json";
import { selectBookmarkSkeleton } from "./bookmarkSkeletonGeometry";

describe("captured bookmark card geometry", () => {
  it.each(["masonry", "grid", "list", "compact"] as const)(
    "captures %s at mobile and desktop media layouts for narrow and wide cards",
    (layout) => {
      for (const desktop of [false, true]) {
        for (const width of [112, 144, 208, 320, 560, 1360]) {
          const result = selectBookmarkSkeleton(
            captures,
            layout,
            width,
            desktop,
          )!;
          expect(result.width).toBe(width);
          expect(result.height).toBeGreaterThan(0);
          expect(result.bones.length).toBeGreaterThan(0);
        }
      }
    },
  );

  it("grows a mobile square preview without stretching text or icons", () => {
    const base = selectBookmarkSkeleton(captures, "grid", 144, false)!;
    const grown = selectBookmarkSkeleton(captures, "grid", 155, false)!;
    expect(grown.height - base.height).toBe(11);
    const previewIndex = base.bones.findIndex(
      (bone) => bone.y === 1 && bone.h > 100 && !bone.c,
    );
    expect(previewIndex).toBeGreaterThan(-1);
    expect(grown.bones[previewIndex].h - base.bones[previewIndex].h).toBe(11);
    expect(grown.bones[previewIndex].r).toBe(0);
    const textIndex = base.bones.findIndex(
      (bone) => bone.y > 144 && bone.h === 16,
    );
    expect(grown.bones[textIndex].y - base.bones[textIndex].y).toBe(11);
    expect(grown.bones[textIndex].h).toBe(16);
  });

  it("keeps desktop grid cards at their fixed height for custom column counts", () => {
    for (const width of [112, 190, 320, 700, 1360]) {
      expect(
        selectBookmarkSkeleton(captures, "grid", width, true)?.height,
      ).toBe(384);
    }
  });

  it("retains rounded rectangular list previews and small circular icons", () => {
    const result = selectBookmarkSkeleton(captures, "list", 320, false)!;
    expect(result.bones.some((bone) => bone.h === 128 && bone.r === 12)).toBe(
      true,
    );
    expect(result.bones.some((bone) => bone.h < 32 && bone.r === "50%")).toBe(
      true,
    );
  });

  it("waits for measurement before selecting a capture", () => {
    expect(selectBookmarkSkeleton(captures, "grid", 0, false)).toBeUndefined();
  });
});
