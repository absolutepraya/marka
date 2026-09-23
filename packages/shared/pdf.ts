export const PDF_AI_SAMPLE_PAGE_COUNT = 6;
const PDF_PAGE_MARKER_PATTERN = /^\[\[MARKA_PDF_PAGE:(\d+)\]\]$/;

interface ParsedPdfMetadata {
  pageCount?: unknown;
  marka?: {
    pageCount?: unknown;
  };
}

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function getPdfPageCount(metadata: string | null | undefined) {
  if (!metadata) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadata) as ParsedPdfMetadata;
    return (
      positiveInteger(parsed.marka?.pageCount) ??
      positiveInteger(parsed.pageCount)
    );
  } catch {
    return undefined;
  }
}

export function selectRepresentativePageNumbers(
  pageCount: number,
  maxPages = PDF_AI_SAMPLE_PAGE_COUNT,
): number[] {
  if (pageCount <= 0 || maxPages <= 0) {
    return [];
  }

  if (pageCount <= maxPages) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const candidates = [
    1,
    2,
    Math.round(pageCount * 0.25),
    Math.round(pageCount * 0.5),
    Math.round(pageCount * 0.75),
    pageCount,
  ].map((page) => Math.min(pageCount, Math.max(1, page)));

  const selectedPages = new Set(candidates);
  const targetPageCount = Math.min(pageCount, maxPages);
  for (let page = 1; selectedPages.size < targetPageCount; page += 1) {
    selectedPages.add(page);
  }

  return [...selectedPages]
    .sort((left, right) => left - right)
    .slice(0, maxPages);
}

export function parsePdfPageText(content: string): PdfPageText[] {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  if (!normalizedContent.trim()) {
    return [];
  }

  const lines = normalizedContent.split("\n");
  const pages = new Map<number, string>();
  let currentPage = 1;
  let currentLines: string[] = [];
  let sawPageMarker = false;

  const flushPage = () => {
    const text = currentLines.join("\n").trim();
    if (text || !pages.has(currentPage)) {
      pages.set(currentPage, text);
    }
    currentLines = [];
  };

  for (const line of lines) {
    const canonicalMarker = line.match(PDF_PAGE_MARKER_PATTERN);
    if (canonicalMarker) {
      sawPageMarker = true;
      flushPage();
      currentPage = Number(canonicalMarker[1]);
      continue;
    }

    const legacyMarker = line.match(/^-+Page \((\d+)\) Break-+$/);
    if (legacyMarker) {
      sawPageMarker = true;
      flushPage();
      currentPage = Number(legacyMarker[1]) + 2;
      continue;
    }

    currentLines.push(line);
  }
  flushPage();

  if (!sawPageMarker) {
    return [{ pageNumber: 1, text: normalizedContent.trim() }];
  }

  return [...pages.entries()]
    .map(([pageNumber, text]) => ({ pageNumber, text }))
    .filter((page) => page.text.length > 0)
    .sort((left, right) => left.pageNumber - right.pageNumber);
}

export function formatPdfPageText(pages: Iterable<PdfPageText>): string {
  return [...pages]
    .filter((page) => page.text.trim().length > 0)
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => `[[MARKA_PDF_PAGE:${page.pageNumber}]]\n${page.text.trim()}`)
    .join("\n\n");
}

export function samplePdfText(
  content: string,
  pageCount?: number,
  maxPages = PDF_AI_SAMPLE_PAGE_COUNT,
): string {
  const pages = parsePdfPageText(content);
  if (pages.length === 0) {
    return content.trim();
  }

  const pagesByNumber = new Map(
    pages.map((page) => [page.pageNumber, page] as const),
  );
  const totalPages = Math.max(
    pageCount ?? 0,
    ...pages.map((page) => page.pageNumber),
  );
  const selectedPages = selectRepresentativePageNumbers(totalPages, maxPages);
  const sampled = selectedPages
    .map((pageNumber) => pagesByNumber.get(pageNumber))
    .filter((page): page is PdfPageText => page !== undefined);

  if (sampled.length === 0) {
    return formatPdfPageText(pages);
  }

  // OCR may only have produced a bounded subset of pages. Fill any remaining
  // sample slots with available pages rather than returning an unnecessarily
  // small prompt.
  const remaining = pages
    .filter(
      (page) =>
        !sampled.some(
          (sampledPage) => sampledPage.pageNumber === page.pageNumber,
        ),
    )
    .slice(0, Math.max(0, maxPages - sampled.length));

  return formatPdfPageText([...sampled, ...remaining]);
}
