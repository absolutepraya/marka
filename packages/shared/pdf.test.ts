import { describe, expect, it } from "vitest";

import {
  formatPdfPageText,
  parsePdfPageText,
  samplePdfText,
  selectRepresentativePageNumbers,
} from "./pdf";

describe("PDF text sampling", () => {
  it("selects the first, quarter, middle, three-quarter, and last pages", () => {
    expect(selectRepresentativePageNumbers(60)).toEqual([1, 2, 15, 30, 45, 60]);
  });

  it("uses every page for short PDFs", () => {
    expect(selectRepresentativePageNumbers(4)).toEqual([1, 2, 3, 4]);
  });

  it("parses and formats page markers", () => {
    const pages = parsePdfPageText("Page 1\nOne\n\nPage 2\nTwo");
    expect(pages).toEqual([
      { pageNumber: 1, text: "One" },
      { pageNumber: 2, text: "Two" },
    ]);
    expect(formatPdfPageText(pages)).toBe("Page 1\nOne\n\nPage 2\nTwo");
  });

  it("supports the legacy pdf2json page separator", () => {
    expect(
      parsePdfPageText(
        "First\n----------------Page (0) Break----------------\nSecond",
      ),
    ).toEqual([
      { pageNumber: 1, text: "First" },
      { pageNumber: 2, text: "Second" },
    ]);
  });

  it("samples representative pages and fills missing OCR pages", () => {
    const content = [1, 2, 20, 30]
      .map((page) => `Page ${page}\nContent ${page}`)
      .join("\n\n");
    expect(samplePdfText(content, 60)).toBe(
      "Page 1\nContent 1\n\nPage 2\nContent 2\n\nPage 20\nContent 20\n\nPage 30\nContent 30",
    );
  });
});
