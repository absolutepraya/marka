import type { SkeletonResult } from "boneyard-js";
import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import { normalizeBone } from "boneyard-js";

export type BookmarkSkeletonCaptures = Record<
  "mobile" | "desktop",
  Record<BookmarksLayoutTypes, Record<string, SkeletonResult>>
>;

export function selectBookmarkSkeleton(
  captures: BookmarkSkeletonCaptures,
  layout: BookmarksLayoutTypes,
  width: number,
  desktop: boolean,
) {
  const samples = Object.values(
    captures[desktop ? "desktop" : "mobile"][layout],
  );
  const capture = samples.reduce<SkeletonResult | undefined>(
    (closest, sample) =>
      !closest ||
      Math.abs(sample.width - width) < Math.abs(closest.width - width)
        ? sample
        : closest,
    undefined,
  );
  if (!capture || width <= 0) return undefined;

  // Below sm, the real grid/masonry preview is square. Resize that preview
  // and move everything below it, keeping text and icon heights unchanged.
  const delta =
    !desktop && (layout === "grid" || layout === "masonry")
      ? width - capture.width
      : 0;
  return {
    ...capture,
    width,
    height: capture.height + delta,
    bones: capture.bones.map((raw) => {
      const bone = normalizeBone(raw);
      // Boneyard treats every square image as a circle. These large media
      // bones are card previews, which keep the real card's rectangular shape.
      const rectangularPreview = bone.r === "50%" && bone.h >= 96;
      const squarePreview =
        !desktop &&
        (layout === "grid" || layout === "masonry") &&
        bone.y < 2 &&
        Math.abs(bone.h - capture.width) < 5;
      return {
        ...bone,
        r: squarePreview
          ? 0
          : rectangularPreview
            ? layout === "list"
              ? 12
              : 0
            : bone.r,
        y: bone.y >= capture.width - 1 ? bone.y + delta : bone.y,
        h:
          bone.y < 2 && Math.abs(bone.h - capture.width) < 5
            ? bone.h + delta
            : bone.h,
      };
    }),
  };
}
