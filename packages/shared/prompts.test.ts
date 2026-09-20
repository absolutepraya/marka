import { describe, expect, it } from "vitest";

import {
  constructSummaryPrompt,
  constructTextTaggingPrompt,
  normalizeSummary,
} from "./prompts";

describe("normalizeSummary", () => {
  it("keeps exactly two paragraphs when the model returns extra breaks", () => {
    expect(
      normalizeSummary("Main idea.\n\nUseful detail.\n\nAnother detail."),
    ).toBe("Main idea.\n\nUseful detail. Another detail.");
  });

  it("splits a single paragraph at a sentence boundary", () => {
    expect(
      normalizeSummary("First sentence. Second sentence. Third sentence."),
    ).toBe("First sentence. Second sentence.\n\nThird sentence.");
  });

  it("still produces two paragraphs when there is no sentence punctuation", () => {
    expect(normalizeSummary("one two three four")).toBe(
      "one two\n\nthree four",
    );
  });
});

describe("enrichment prompts", () => {
  it("allows durable new tags while prioritizing existing candidates", () => {
    const prompt = constructTextTaggingPrompt(
      "English",
      [],
      "Content",
      "as-generated",
      undefined,
      ["machine learning", "web development"],
    );

    expect(prompt).toContain("Prefer existing candidate tags");
    expect(prompt).toContain("Create a new tag only when");
    expect(prompt).toContain("Aim for 3-6 tags");
    expect(prompt).toContain("machine learning, web development");
  });

  it("requires the two-paragraph summary contract", () => {
    const prompt = constructSummaryPrompt("English", [], "Content");

    expect(prompt).toContain("exactly two paragraphs");
    expect(prompt).toContain("main idea and scope");
    expect(prompt).toContain(
      "useful details, implications, or practical meaning",
    );
  });
});
