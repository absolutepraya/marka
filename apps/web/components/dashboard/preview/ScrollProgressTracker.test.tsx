import { describe, expect, it } from "vitest";

import { hasSavedReadingPosition } from "@karakeep/shared-react/components/ScrollProgressTracker";

describe("ScrollProgressTracker", () => {
  it("restores a saved zero-percent position", () => {
    expect(hasSavedReadingPosition(0, null, 0)).toBe(true);
    expect(hasSavedReadingPosition(0, null, null)).toBe(false);
  });
});
