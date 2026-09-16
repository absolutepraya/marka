// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import {
  normalizeText,
  normalizeTextLength,
  scrollToReadingPercentage,
  scrollToReadingStart,
  scrollToReadingPosition,
} from "./reading-progress-dom";

describe("normalizeText", () => {
  test("collapses multiple spaces to single space", () => {
    expect(normalizeText("hello    world")).toBe("hello world");
  });

  test("collapses newlines and tabs to single space", () => {
    expect(normalizeText("hello\n\nworld")).toBe("hello world");
    expect(normalizeText("hello\t\tworld")).toBe("hello world");
    expect(normalizeText("hello\r\nworld")).toBe("hello world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello world  ")).toBe("hello world");
    expect(normalizeText("\n\nhello world\n\n")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  test("handles whitespace-only string", () => {
    expect(normalizeText("   ")).toBe("");
    expect(normalizeText("\n\t\r")).toBe("");
  });

  test("handles text with no extra whitespace", () => {
    expect(normalizeText("hello world")).toBe("hello world");
  });

  test("handles mixed whitespace types", () => {
    expect(normalizeText("hello  \n\t  world")).toBe("hello world");
  });
});

describe("normalizeTextLength", () => {
  test("returns length of normalized text", () => {
    expect(normalizeTextLength("hello world")).toBe(11);
  });

  test("returns normalized length for text with extra whitespace", () => {
    // "hello    world" normalizes to "hello world" (11 chars)
    expect(normalizeTextLength("hello    world")).toBe(11);
  });

  test("returns 0 for empty string", () => {
    expect(normalizeTextLength("")).toBe(0);
  });

  test("returns 0 for whitespace-only string", () => {
    expect(normalizeTextLength("   \n\t")).toBe(0);
  });
});

describe("scrollToReadingPosition", () => {
  test("restores to a data reading block during offset fallback", () => {
    const container = document.createElement("article");
    const block = document.createElement("div");
    const text = document.createElement("span");
    const scrollIntoView = vi.fn();

    block.dataset.readingBlock = "true";
    block.scrollIntoView = scrollIntoView;
    text.scrollIntoView = vi.fn();
    text.textContent = "Second block";
    block.append(text);
    container.append(document.createTextNode("First block"), block);
    document.body.append(container);

    expect(scrollToReadingPosition(container, 12, "auto")).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });

    container.remove();
  });
});

describe("scrollToReadingStart", () => {
  test("scrolls the window to the beginning", () => {
    const container = document.createElement("article");
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    document.body.append(container);

    scrollToReadingStart(container, "auto");

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    scrollTo.mockRestore();
    container.remove();
  });

  test("falls back to a saved percentage using normalized text position", () => {
    const container = document.createElement("article");
    container.innerHTML =
      "<p>Short.</p><p>Long content that should receive the fallback.</p>";
    const firstParagraph = container.querySelector("p");
    const secondParagraph = container.querySelectorAll("p")[1];
    if (!firstParagraph || !secondParagraph)
      throw new Error("Missing paragraphs");
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    firstParagraph.scrollIntoView = firstScroll;
    secondParagraph.scrollIntoView = secondScroll;
    document.body.append(container);

    expect(scrollToReadingPercentage(container, 50, "auto")).toBe(true);
    expect(secondScroll).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    expect(firstScroll).not.toHaveBeenCalled();

    container.remove();
  });
});
