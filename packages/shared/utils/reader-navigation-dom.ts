export interface ReaderHeading {
  element: HTMLElement;
  id: string;
  level: 2 | 3 | 4;
  text: string;
}

export const READER_SEARCH_MARK_SELECTOR = "mark[data-reader-search-match]";

const SEARCH_MARK_CLASS =
  "reader-search-match rounded-sm bg-yellow-200/80 text-inherit dark:bg-yellow-400/30";
const CURRENT_SEARCH_MARK_CLASS =
  "reader-search-current bg-orange-300/90 dark:bg-orange-400/60";

function normalizeHeadingText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

function getUniqueHeadingId(
  container: HTMLElement,
  candidate: string,
  usedIds: Set<string>,
): string {
  let id = candidate;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${candidate}-${suffix}`;
    suffix += 1;
  }

  const existingElement = container.ownerDocument.getElementById(id);
  if (existingElement && !container.contains(existingElement)) {
    return getUniqueHeadingId(container, `${candidate}-section`, usedIds);
  }

  usedIds.add(id);
  return id;
}

/**
 * Prepares the headings used by the Reader View table of contents.
 *
 * Only h2 through h4 are part of the reader navigation contract. Headings are
 * made programmatically focusable so keyboard users land on the destination
 * instead of losing context after a table-of-contents jump.
 */
export function prepareReaderHeadings(container: HTMLElement): ReaderHeading[] {
  const usedIds = new Set<string>();
  const headings = Array.from(
    container.querySelectorAll<HTMLElement>("h2, h3, h4"),
  );

  return headings.map((element, index) => {
    const text = normalizeHeadingText(element.textContent ?? "");
    const baseId =
      element.id || `reader-${slugifyHeading(text || `section-${index + 1}`)}`;
    const id = getUniqueHeadingId(container, baseId, usedIds);

    element.id = id;
    if (!element.hasAttribute("tabindex")) {
      element.tabIndex = -1;
    }
    element.dataset.readerHeading = "true";

    return {
      element,
      id,
      level: Number(element.tagName.slice(1)) as 2 | 3 | 4,
      text: text || `Section ${index + 1}`,
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSearchExcluded(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;

  return Boolean(
    parent.closest(
      "script, style, noscript, template, [data-reader-search-exclude]",
    ),
  );
}

/** Removes the marks owned by the Reader View search control. */
export function clearReaderSearchMarks(container: HTMLElement): void {
  const marks = Array.from(
    container.querySelectorAll<HTMLElement>(READER_SEARCH_MARK_SELECTOR),
  );

  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;

    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }

  container.normalize();
}

/**
 * Applies literal, case-insensitive search marks to content and returns them
 * in document order. The caller owns the active-result state.
 */
export function applyReaderSearchMarks(
  container: HTMLElement,
  query: string,
): HTMLElement[] {
  clearReaderSearchMarks(container);

  const searchText = query.trim();
  if (!searchText) return [];

  const matcher = new RegExp(escapeRegExp(searchText), "gi");
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const textNodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (!isSearchExcluded(textNode)) {
      textNodes.push(textNode);
    }
  }

  const marks: HTMLElement[] = [];
  for (const textNode of textNodes) {
    const text = textNode.data;
    const matches = Array.from(text.matchAll(matcher));
    if (matches.length === 0) continue;
    const textNodeMarks: HTMLElement[] = [];

    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      const start = match.index;
      const matchedText = match[0];
      if (start === undefined || matchedText.length === 0) continue;

      const matchNode = textNode.splitText(start);
      matchNode.splitText(matchedText.length);

      const mark = container.ownerDocument.createElement("mark");
      mark.dataset.readerSearchMatch = "true";
      mark.className = SEARCH_MARK_CLASS;
      matchNode.parentNode?.insertBefore(mark, matchNode);
      mark.appendChild(matchNode);
      textNodeMarks.unshift(mark);
    }

    marks.push(...textNodeMarks);
  }

  return marks;
}

/** Marks one search result as current and clears the state from all others. */
export function setCurrentReaderSearchMark(
  marks: HTMLElement[],
  currentIndex: number,
): HTMLElement | null {
  marks.forEach((mark) => {
    mark.classList.remove(...CURRENT_SEARCH_MARK_CLASS.split(" "));
    mark.removeAttribute("data-reader-search-current");
    mark.removeAttribute("aria-current");
  });

  const current = marks[currentIndex] ?? null;
  if (current) {
    current.classList.add(...CURRENT_SEARCH_MARK_CLASS.split(" "));
    current.dataset.readerSearchCurrent = "true";
    current.setAttribute("aria-current", "true");
  }

  return current;
}
