import type { ResponsiveBones, SkeletonResult } from "boneyard-js";

// Keep viewport-dependent styles (such as stacked mobile headers) separate,
// then choose the closest actual content width within that mode.
export function selectSurfaceCapture(
  bones: ResponsiveBones,
  width: number,
  viewport: number,
): SkeletonResult | undefined {
  if (width <= 0 || viewport <= 0) return undefined;
  const mobile = viewport < 640;
  const samples = Object.entries(bones.breakpoints).filter(
    ([breakpoint]) => Number(breakpoint) < 640 === mobile,
  );
  return samples.reduce<SkeletonResult | undefined>((best, [, sample]) => {
    if (!best) return sample;
    const distance = Math.abs(sample.width - width);
    const bestDistance = Math.abs(best.width - width);
    if (distance < bestDistance) return sample;
    // Centered columns can have identical widths at different media queries.
    // Keep the closest viewport's layout when their container widths tie.
    if (
      distance === bestDistance &&
      Math.abs(sample.viewportWidth - viewport) <
        Math.abs(best.viewportWidth - viewport)
    )
      return sample;
    return best;
  }, undefined);
}
