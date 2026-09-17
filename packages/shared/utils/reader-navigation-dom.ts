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

interface SearchTextReference {
  node: Text;
  start: number;
  end: number;
}

interface VisibleTextCharacter {
  character: string;
  references: SearchTextReference[];
}

interface SearchMatchRange {
  matchIndex: number;
  references: SearchTextReference[];
}

interface SearchTextSegment {
  node: Text;
  start: number;
  end: number;
}

function mergeSearchTextSegments(
  references: SearchTextReference[],
): SearchTextSegment[] {
  const segments: SearchTextSegment[] = [];

  for (const reference of references) {
    const previous = segments[segments.length - 1];
    if (previous?.node === reference.node && previous.end === reference.start) {
      previous.end = reference.end;
    } else {
      segments.push({ ...reference });
    }
  }

  return segments;
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

const SEARCH_BOUNDARY = "\u0000";

function collectVisibleTextCharacters(
  container: HTMLElement,
): VisibleTextCharacter[] {
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const characters: VisibleTextCharacter[] = [];
  let pendingWhitespace: SearchTextReference[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (isSearchExcluded(textNode)) {
      if (textNode.data.length > 0 && characters.length > 0) {
        characters.push({ character: SEARCH_BOUNDARY, references: [] });
      }
      pendingWhitespace = [];
      continue;
    }

    for (let index = 0; index < textNode.data.length; index += 1) {
      const character = textNode.data[index];
      if (/\s/.test(character)) {
        pendingWhitespace.push({
          node: textNode,
          start: index,
          end: index + 1,
        });
        continue;
      }

      if (pendingWhitespace.length > 0) {
        if (characters.length > 0) {
          characters.push({
            character: " ",
            references: pendingWhitespace,
          });
        }
        pendingWhitespace = [];
      }

      characters.push({
        character,
        references: [
          {
            node: textNode,
            start: index,
            end: index + 1,
          },
        ],
      });
    }
  }

  return characters;
}

/**
 * Applies literal, case-insensitive search marks to rendered content and
 * returns them in document order. Whitespace is matched using the browser's
 * collapsed-text model, so a result can span multiple inline elements. The
 * caller owns the active-result state.
 */
export function applyReaderSearchMarks(
  container: HTMLElement,
  query: string,
): HTMLElement[] {
  clearReaderSearchMarks(container);

  const searchText = query.trim().replace(/\s+/g, " ");
  if (!searchText) return [];

  const characters = collectVisibleTextCharacters(container);
  const visibleText = characters.map(({ character }) => character).join("");
  const matcher = new RegExp(escapeRegExp(searchText), "gi");
  const matches = Array.from(visibleText.matchAll(matcher));
  const matchRanges: SearchMatchRange[] = [];

  matches.forEach((match, matchIndex) => {
    const start = match.index;
    const end = start + match[0].length;
    if (start === undefined || end <= start) return;

    const references = characters
      .slice(start, end)
      .flatMap(({ references: characterReferences }) => characterReferences);
    if (references.length === 0) return;

    matchRanges.push({
      matchIndex,
      references,
    });
  });

  const marks: (HTMLElement | undefined)[] = [];
  for (const matchRange of matchRanges.sort(
    (left, right) => right.matchIndex - left.matchIndex,
  )) {
    const segments = mergeSearchTextSegments(matchRange.references);
    const segmentMarks: HTMLElement[] = [];

    for (const segment of segments.reverse()) {
      const range = container.ownerDocument.createRange();
      range.setStart(segment.node, segment.start);
      range.setEnd(segment.node, segment.end);

      const mark = container.ownerDocument.createElement("mark");
      mark.dataset.readerSearchMatch = "true";
      mark.dataset.readerSearchMatchIndex = String(matchRange.matchIndex);
      mark.className = SEARCH_MARK_CLASS;
      range.surroundContents(mark);
      segmentMarks.unshift(mark);
    }

    marks[matchRange.matchIndex] = segmentMarks[0];
  }

  return marks.filter((mark): mark is HTMLElement => Boolean(mark));
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
