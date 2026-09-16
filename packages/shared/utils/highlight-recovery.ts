export interface HighlightRecoveryInput {
  startOffset: number;
  endOffset: number;
  text: string | null;
  contextBefore?: string | null;
  contextAfter?: string | null;
}

export interface HighlightTextRange {
  node: Text;
  start: number;
  end: number;
}

export type HighlightRecoveryResult =
  | {
      status: "resolved";
      source: "offset" | "text";
      ranges: HighlightTextRange[];
    }
  | {
      status: "needs_review";
      reason: "ambiguous" | "missing";
    };

interface TextNodeInfo {
  node: Text;
  startOffset: number;
  endOffset: number;
}

function normalizeHighlightText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTextNodes(container: HTMLElement): TextNodeInfo[] {
  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );
  const nodes: TextNodeInfo[] = [];
  let offset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const endOffset = offset + textNode.data.length;
    nodes.push({ node: textNode, startOffset: offset, endOffset });
    offset = endOffset;
  }

  return nodes;
}

export function getHighlightText(ranges: HighlightTextRange[]): string {
  return ranges
    .map(({ node, start, end }) => node.data.slice(start, end))
    .join("");
}

export function getHighlightRangesForOffsets(
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
): HighlightTextRange[] | null {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset <= startOffset
  ) {
    return null;
  }

  const ranges: HighlightTextRange[] = [];
  const nodes = collectTextNodes(container);
  for (const { node, startOffset: nodeStart, endOffset: nodeEnd } of nodes) {
    if (nodeStart < endOffset && nodeEnd > startOffset) {
      ranges.push({
        node,
        start: Math.max(0, startOffset - nodeStart),
        end: Math.min(node.data.length, endOffset - nodeStart),
      });
    }
  }

  if (ranges.length === 0 || getHighlightText(ranges).length === 0) {
    return null;
  }

  const totalTextLength = nodes.at(-1)?.endOffset ?? 0;
  if (endOffset > totalTextLength) return null;

  return ranges;
}

function getRangesForRawOffsets(
  nodes: TextNodeInfo[],
  startOffset: number,
  endOffset: number,
): HighlightTextRange[] {
  return nodes
    .filter(
      ({ startOffset: nodeStart, endOffset: nodeEnd }) =>
        nodeStart < endOffset && nodeEnd > startOffset,
    )
    .map(({ node, startOffset: nodeStart }) => ({
      node,
      start: Math.max(0, startOffset - nodeStart),
      end: Math.min(node.data.length, endOffset - nodeStart),
    }));
}

function findTextCandidates(
  nodes: TextNodeInfo[],
  savedText: string,
): {
  ranges: HighlightTextRange[];
  startOffset: number;
  endOffset: number;
}[] {
  const query = savedText.trim();
  if (!query) return [];

  const fullText = nodes.map(({ node }) => node.data).join("");
  const pattern = query.split(/\s+/).map(escapeRegExp).join("\\s+");
  const matcher = new RegExp(pattern, "gi");
  const candidates: {
    ranges: HighlightTextRange[];
    startOffset: number;
    endOffset: number;
  }[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(fullText))) {
    const startOffset = match.index;
    const endOffset = startOffset + match[0].length;
    candidates.push({
      ranges: getRangesForRawOffsets(nodes, startOffset, endOffset),
      startOffset,
      endOffset,
    });
    if (match[0].length === 0) matcher.lastIndex += 1;
  }

  return candidates.filter(({ ranges }) => ranges.length > 0);
}

function candidateMatchesContext(
  fullText: string,
  candidate: { startOffset: number; endOffset: number },
  contextBefore: string | null | undefined,
  contextAfter: string | null | undefined,
): boolean {
  const before = normalizeHighlightText(contextBefore ?? "");
  const after = normalizeHighlightText(contextAfter ?? "");
  if (!before && !after) return true;

  const actualBefore = normalizeHighlightText(
    fullText.slice(0, candidate.startOffset),
  );
  const actualAfter = normalizeHighlightText(
    fullText.slice(candidate.endOffset),
  );

  return (
    (!before || actualBefore.endsWith(before)) &&
    (!after || actualAfter.startsWith(after))
  );
}

/**
 * Resolves a saved highlight without silently moving it to an unsafe match.
 * Existing offsets are accepted only when their text still matches. A changed
 * document may recover through one unique saved-quote match; zero or multiple
 * candidates remain visible to the caller as Needs review.
 */
export function recoverHighlight(
  container: HTMLElement,
  highlight: HighlightRecoveryInput,
): HighlightRecoveryResult {
  const offsetRanges = getHighlightRangesForOffsets(
    container,
    highlight.startOffset,
    highlight.endOffset,
  );
  const savedText = highlight.text;

  if (offsetRanges) {
    if (
      savedText === null ||
      normalizeHighlightText(getHighlightText(offsetRanges)) ===
        normalizeHighlightText(savedText)
    ) {
      return {
        status: "resolved",
        source: "offset",
        ranges: offsetRanges,
      };
    }
  }

  if (!savedText?.trim()) {
    return { status: "needs_review", reason: "missing" };
  }

  const nodes = collectTextNodes(container);
  const fullText = nodes.map(({ node }) => node.data).join("");
  const candidates = findTextCandidates(nodes, savedText).filter((candidate) =>
    candidateMatchesContext(
      fullText,
      candidate,
      highlight.contextBefore,
      highlight.contextAfter,
    ),
  );
  if (candidates.length !== 1) {
    return {
      status: "needs_review",
      reason: candidates.length === 0 ? "missing" : "ambiguous",
    };
  }

  return {
    status: "resolved",
    source: "text",
    ranges: candidates[0].ranges,
  };
}
