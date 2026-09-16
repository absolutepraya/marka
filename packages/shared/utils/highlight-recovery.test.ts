// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { getHighlightText, recoverHighlight } from "./highlight-recovery";

describe("recoverHighlight", () => {
  test("trusts an offset when it still contains the saved quote", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>Keep this saved quote.</p>";

    const result = recoverHighlight(container, {
      startOffset: 5,
      endOffset: 21,
      text: "this saved quote",
    });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.source).toBe("offset");
      expect(getHighlightText(result.ranges)).toBe("this saved quote");
    }
  });

  test("recovers a unique quote after content is inserted before it", () => {
    const container = document.createElement("article");
    container.innerHTML =
      "<p>New introduction.</p><p>Keep this saved quote.</p>";

    const result = recoverHighlight(container, {
      startOffset: 5,
      endOffset: 21,
      text: "this saved quote",
    });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.source).toBe("text");
      expect(getHighlightText(result.ranges)).toBe("this saved quote");
    }
  });

  test("recovers quotes split across inline elements", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p><strong>Keep this</strong> saved quote.</p>";

    const result = recoverHighlight(container, {
      startOffset: 0,
      endOffset: 16,
      text: "Keep this saved quote",
    });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(getHighlightText(result.ranges)).toBe("Keep this saved quote");
    }
  });

  test("requires review when the saved quote is ambiguous", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>Repeat this.</p><p>Repeat this.</p>";

    const result = recoverHighlight(container, {
      startOffset: 1,
      endOffset: 7,
      text: "Repeat",
    });

    expect(result).toEqual({ status: "needs_review", reason: "ambiguous" });
  });

  test("uses saved context to recover the intended repeated quote", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>First repeat here.</p><p>Second repeat here.</p>";

    const result = recoverHighlight(container, {
      startOffset: 0,
      endOffset: 6,
      text: "repeat",
      contextBefore: "First ",
      contextAfter: " here.",
    });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(getHighlightText(result.ranges)).toBe("repeat");
    }
  });

  test("requires review when the saved quote is missing", () => {
    const container = document.createElement("article");
    container.innerHTML = "<p>The content changed.</p>";

    const result = recoverHighlight(container, {
      startOffset: 0,
      endOffset: 5,
      text: "No longer here",
    });

    expect(result).toEqual({ status: "needs_review", reason: "missing" });
  });
});
