import { describe, expect, it } from "vitest";

import { combineSearchContent } from "./search";

describe("combineSearchContent", () => {
  it("combines asset content and a ready transcript", () => {
    expect(
      combineSearchContent("Extracted asset text", "Transcribed speech"),
    ).toBe("Extracted asset text\n\nTranscribed speech");
  });

  it("ignores missing or whitespace-only content", () => {
    expect(combineSearchContent(null, "  ", "Transcript")).toBe("Transcript");
    expect(combineSearchContent(null, undefined)).toBeNull();
  });
});
