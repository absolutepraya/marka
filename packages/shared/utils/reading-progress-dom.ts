/**
 * Reading Progress Utilities
 *
 * Functions for reading position tracking in web contexts.
 * Includes text normalization, position calculation, scroll restoration,
 * and Radix ScrollArea detection.
 */

/**
 * Reading position data including offset, anchor text for verification, and percentage.
 */
export interface ReadingPosition {
  offset: number;
  anchor: string;
  percent: number;
}

const PARAGRAPH_SELECTORS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "[data-reading-block]",
];

const PARAGRAPH_SELECTOR_STRING = PARAGRAPH_SELECTORS.join(", ");

/**
 * Maximum length of anchor text extracted from paragraphs.
 * Used for position verification when restoring reading progress.
 */
export const ANCHOR_TEXT_MAX_LENGTH = 50;

/** Threshold in pixels for detecting "scrolled to bottom" */
const SCROLL_BOTTOM_THRESHOLD = 5;

/** Minimum interval between scroll position updates (milliseconds) */
export const SCROLL_THROTTLE_MS = 150;

/**
 * Scroll position info for determining if user is at bottom of content.
 */
interface ScrollInfo {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Normalizes text by collapsing all whitespace to single spaces and trimming.
 * This ensures consistent character counting regardless of HTML formatting.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the normalized length of text for consistent offset calculation.
 */
export function normalizeTextLength(text: string): number {
  return normalizeText(text).length;
}

interface ReadingTextMetrics {
  totalLength: number;
  blockOffsets: Map<Element, number>;
}

function getReadingTextMetrics(
  container: HTMLElement,
  paragraphs: Element[],
): ReadingTextMetrics {
  const paragraphSet = new Set(paragraphs);
  const blockOffsets = new Map<Element, number>();
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  let totalLength = 0;
  let pendingWhitespace = false;
  let hasText = false;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const closestParagraph = textNode.parentElement?.closest(
      PARAGRAPH_SELECTOR_STRING,
    );
    const paragraph =
      closestParagraph && paragraphSet.has(closestParagraph)
        ? closestParagraph
        : null;

    for (const characterMatch of textNode.data.matchAll(/[\s\S]/g)) {
      if (/\s/.test(characterMatch[0])) {
        pendingWhitespace = hasText;
        continue;
      }

      if (pendingWhitespace && hasText) {
        totalLength += 1;
      }
      pendingWhitespace = false;

      if (paragraph && !blockOffsets.has(paragraph)) {
        blockOffsets.set(paragraph, totalLength);
      }

      totalLength += 1;
      hasText = true;
    }
  }

  return { totalLength, blockOffsets };
}

/**
 * Check if element is visible (not hidden by CSS display:none).
 * Uses bounding rect - hidden elements have 0 dimensions.
 * We use this instead of offsetParent because dialogs use position:fixed,
 * which makes offsetParent null even for visible elements.
 */
export function isElementVisible(element: HTMLElement | null): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Finds the nearest scrollable ancestor of an element.
 * Handles both standard overflow-based scrolling, Radix ScrollArea components,
 * and window-level scrolling (falls back to document.documentElement).
 */
export function findScrollableParent(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const style = getComputedStyle(current);
    const overflowY = style.overflowY;
    const isOverflowScrollable = overflowY === "auto" || overflowY === "scroll";
    // Check for Radix ScrollArea viewport (uses data attribute for scrolling)
    const isRadixViewport = current.hasAttribute(
      "data-radix-scroll-area-viewport",
    );

    const isCandidate = isOverflowScrollable || isRadixViewport;
    const hasScrollContent = current.scrollHeight > current.clientHeight;

    if (isCandidate && hasScrollContent) {
      return current;
    }
    current = current.parentElement;
  }

  // Fall back to document.documentElement for window-level scrolling
  return document.documentElement;
}

/**
 * Calculates the text offset of the paragraph at the top of the viewport.
 * Finds the paragraph whose top edge is at or near the top of the visible area.
 * Returns offset, anchor text for position verification, and percentage through the document.
 *
 * Handles nested scrolling with Radix ScrollArea detection.
 * Returns 100% when scrolled to the bottom of the document.
 */
export function getReadingPosition(
  container: HTMLElement,
): ReadingPosition | null {
  // Find the scrollable parent to get the correct viewport reference
  const scrollParent = findScrollableParent(container);
  const isWindowScroll = scrollParent === document.documentElement;

  // Build scroll info for 100% detection
  const scrollInfo: ScrollInfo = {
    scrollTop: isWindowScroll ? window.scrollY : scrollParent.scrollTop,
    scrollHeight: isWindowScroll
      ? document.body.scrollHeight
      : scrollParent.scrollHeight,
    clientHeight: isWindowScroll
      ? window.innerHeight
      : scrollParent.clientHeight,
  };

  // For window-level scrolling, viewport top is 0; for container scrolling, use container's top
  const viewportTop = isWindowScroll
    ? 0
    : scrollParent.getBoundingClientRect().top;

  return getReadingPositionWithViewport(container, viewportTop, scrollInfo);
}

/**
 * Calculates the text offset of the paragraph at the top of the viewport.
 * Takes explicit viewport top position and optional scroll info for bottom detection.
 */
function getReadingPositionWithViewport(
  container: HTMLElement,
  viewportTop: number,
  scrollInfo?: ScrollInfo,
): ReadingPosition | null {
  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
  );
  if (paragraphs.length === 0) return null;

  const metrics = getReadingTextMetrics(container, paragraphs);
  const { totalLength } = metrics;

  // Check if scrolled to bottom - return 100% immediately
  if (scrollInfo) {
    const { scrollTop, scrollHeight, clientHeight } = scrollInfo;
    const isAtBottom =
      scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_THRESHOLD;

    if (isAtBottom) {
      // Find the last paragraph for anchor text
      const lastParagraph = paragraphs[paragraphs.length - 1];
      const anchor = lastParagraph
        ? normalizeText(lastParagraph.textContent ?? "").slice(
            0,
            ANCHOR_TEXT_MAX_LENGTH,
          )
        : "";

      return { offset: totalLength, anchor, percent: 100 };
    }
  }

  // Find the paragraph at the top of the viewport
  let topParagraph: Element | null = null;

  for (const paragraph of paragraphs) {
    const rect = paragraph.getBoundingClientRect();

    // If this paragraph's top is at or below the viewport top, it's our target
    if (rect.top >= viewportTop) {
      topParagraph = paragraph;
      break;
    }

    // If this paragraph spans the viewport top (started above, ends below), use it
    if (rect.top < viewportTop && rect.bottom > viewportTop) {
      topParagraph = paragraph;
      break;
    }
  }

  if (!topParagraph) return null;

  // Extract anchor text for position verification
  const anchor = normalizeText(topParagraph.textContent ?? "").slice(
    0,
    ANCHOR_TEXT_MAX_LENGTH,
  );

  const offset = metrics.blockOffsets.get(topParagraph);
  if (offset !== undefined) {
    // Calculate percentage (clamped to 0-100) from the same normalized text
    // offset used by percentage fallback restoration.
    const percent =
      totalLength > 0
        ? Math.min(100, Math.max(0, Math.round((offset / totalLength) * 100)))
        : 0;
    return { offset, anchor, percent };
  }

  // topParagraph has no text nodes (empty or contains only non-text elements)
  return null;
}

/**
 * Scrolls to the position in the content corresponding to the given text offset.
 * Uses anchor text for verification when available, falling back to offset-based lookup.
 */
export function scrollToReadingPosition(
  container: HTMLElement,
  offset: number,
  behavior: ScrollBehavior = "smooth",
  anchor?: string | null,
  percent?: number | null,
): boolean {
  // Strategy 1: Try to find paragraph by anchor text (most reliable)
  if (offset > 0 && anchor) {
    const paragraphs = Array.from(
      container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
    );

    let fuzzyMatch: Element | null = null;
    const anchorPrefix = anchor.slice(0, 20);

    for (const paragraph of paragraphs) {
      const paragraphAnchor = normalizeText(paragraph.textContent ?? "").slice(
        0,
        ANCHOR_TEXT_MAX_LENGTH,
      );

      // Exact match - immediate return
      if (paragraphAnchor === anchor) {
        paragraph.scrollIntoView({ behavior, block: "start" });
        return true;
      }

      // Track first fuzzy match for fallback (first 20 chars match)
      if (
        !fuzzyMatch &&
        anchor.length >= 20 &&
        paragraphAnchor.startsWith(anchorPrefix)
      ) {
        fuzzyMatch = paragraph;
      }
    }

    if (fuzzyMatch) {
      fuzzyMatch.scrollIntoView({ behavior, block: "start" });
      return true;
    }
  }

  // Strategy 2: Fall back to normalized text-relative lookup
  if (offset > 0) {
    if (scrollToReadingTextOffset(container, offset, behavior)) return true;
  }

  return scrollToReadingPercentage(container, percent, behavior);
}

/**
 * Restores a saved percentage when an anchor and character offset no longer
 * identify a usable location in the current content.
 */
export function scrollToReadingPercentage(
  container: HTMLElement,
  percent: number | null | undefined,
  behavior: ScrollBehavior = "smooth",
): boolean {
  if (percent == null || !Number.isFinite(percent)) return false;

  const clampedPercent = Math.min(100, Math.max(0, percent));
  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
  );
  const metrics = getReadingTextMetrics(container, paragraphs);

  if (clampedPercent === 0) {
    scrollToReadingStart(container, behavior);
    return true;
  }

  if (metrics.totalLength > 0) {
    const targetOffset = Math.round(
      metrics.totalLength * (clampedPercent / 100),
    );
    if (scrollToReadingTextOffset(container, targetOffset, behavior)) {
      return true;
    }
  }

  const scrollParent = findScrollableParent(container);
  const isWindowScroll = scrollParent === document.documentElement;
  const scrollHeight = isWindowScroll
    ? Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      )
    : scrollParent.scrollHeight;
  const clientHeight = isWindowScroll
    ? window.innerHeight
    : scrollParent.clientHeight;
  const top = Math.max(0, scrollHeight - clientHeight) * (clampedPercent / 100);

  if (isWindowScroll) {
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top, behavior });
    } else {
      document.documentElement.scrollTop = top;
    }
  } else if (typeof scrollParent.scrollTo === "function") {
    scrollParent.scrollTo({ top, behavior });
  } else {
    scrollParent.scrollTop = top;
  }

  return true;
}

function scrollToReadingTextOffset(
  container: HTMLElement,
  offset: number,
  behavior: ScrollBehavior,
): boolean {
  const paragraphs = Array.from(
    container.querySelectorAll(PARAGRAPH_SELECTOR_STRING),
  );
  const metrics = getReadingTextMetrics(container, paragraphs);
  let firstParagraph: Element | null = null;
  let targetParagraph: Element | null = null;

  for (const paragraph of paragraphs) {
    const paragraphOffset = metrics.blockOffsets.get(paragraph);
    if (paragraphOffset === undefined) continue;
    firstParagraph ??= paragraph;
    if (paragraphOffset > offset) break;
    targetParagraph = paragraph;
  }

  targetParagraph ??= firstParagraph;
  if (!targetParagraph) return false;

  targetParagraph.scrollIntoView({ behavior, block: "start" });
  return true;
}

/**
 * Scrolls the content back to its beginning, respecting nested scroll areas.
 */
export function scrollToReadingStart(
  container: HTMLElement,
  behavior: ScrollBehavior = "smooth",
): void {
  const scrollParent = findScrollableParent(container);
  if (scrollParent === document.documentElement) {
    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior });
    } else {
      document.documentElement.scrollTop = 0;
    }
    return;
  }

  if (typeof scrollParent.scrollTo === "function") {
    scrollParent.scrollTo({ top: 0, behavior });
  } else {
    scrollParent.scrollTop = 0;
  }
}
