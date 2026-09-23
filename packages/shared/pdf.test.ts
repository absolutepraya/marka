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

  it("fills duplicate candidate slots for short PDFs", () => {
    expect(selectRepresentativePageNumbers(7)).toHaveLength(6);
    expect(selectRepresentativePageNumbers(8)).toHaveLength(6);
    expect(selectRepresentativePageNumbers(9)).toHaveLength(6);
  });

  it("uses every page for short PDFs", () => {
    expect(selectRepresentativePageNumbers(4)).toEqual([1, 2, 3, 4]);
  });

  it("parses and formats page markers", () => {
    const pages = parsePdfPageText(
      "[[MARKA_PDF_PAGE:1]]\nOne\n\n[[MARKA_PDF_PAGE:2]]\nTwo",
    );
    expect(pages).toEqual([
      { pageNumber: 1, text: "One" },
      { pageNumber: 2, text: "Two" },
    ]);
    expect(formatPdfPageText(pages)).toBe(
      "[[MARKA_PDF_PAGE:1]]\nOne\n\n[[MARKA_PDF_PAGE:2]]\nTwo",
    );
  });

  it("does not treat a literal page heading as a page marker", () => {
    expect(
      parsePdfPageText(
        formatPdfPageText([
          { pageNumber: 1, text: "Intro\nPage 2\nStill page one" },
          { pageNumber: 2, text: "Actual page two" },
        ]),
      ),
    ).toEqual([
      { pageNumber: 1, text: "Intro\nPage 2\nStill page one" },
      { pageNumber: 2, text: "Actual page two" },
    ]);
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
    const content = formatPdfPageText(
      [1, 2, 20, 30].map((page) => ({
        pageNumber: page,
        text: `Content ${page}`,
      })),
    );
    expect(samplePdfText(content, 60)).toBe(
      "[[MARKA_PDF_PAGE:1]]\nContent 1\n\n[[MARKA_PDF_PAGE:2]]\nContent 2\n\n[[MARKA_PDF_PAGE:20]]\nContent 20\n\n[[MARKA_PDF_PAGE:30]]\nContent 30",
    );
  });
});
