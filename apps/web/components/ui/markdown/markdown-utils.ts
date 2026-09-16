interface EscapedBacktickRun {
  start: number;
  length: number;
  end: number;
}

const ESCAPED_BACKTICK = "\\`";

function isActiveEscapedBacktick(markdown: string, index: number) {
  if (!markdown.startsWith(ESCAPED_BACKTICK, index)) {
    return false;
  }

  let precedingBackslashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && markdown[cursor] === "\\";
    cursor -= 1
  ) {
    precedingBackslashes += 1;
  }

  return precedingBackslashes % 2 === 0;
}

function collectEscapedBacktickRuns(markdown: string) {
  const runs: EscapedBacktickRun[] = [];

  for (let index = 0; index < markdown.length; index += 1) {
    if (!isActiveEscapedBacktick(markdown, index)) {
      continue;
    }

    const start = index;
    let length = 0;

    while (isActiveEscapedBacktick(markdown, index)) {
      length += 1;
      index += ESCAPED_BACKTICK.length;
    }

    runs.push({ start, length, end: index });
    index -= 1;
  }

  return runs;
}

function runEndsLine(markdown: string, run: EscapedBacktickRun) {
  const lineEnd = markdown.indexOf("\n", run.end);
  const suffix = markdown.slice(
    run.end,
    lineEnd === -1 ? markdown.length : lineEnd,
  );
  return suffix.trim().length === 0;
}

function markRun(run: EscapedBacktickRun, indexes: Set<number>) {
  for (let offset = 0; offset < run.length; offset += 1) {
    indexes.add(run.start + offset * ESCAPED_BACKTICK.length);
  }
}

/**
 * Repairs code delimiters that were persisted with a backslash before each
 * backtick. Unpaired escaped backticks remain literal Markdown.
 */
export function normalizeEscapedCodeDelimiters(markdown: string) {
  const runs = collectEscapedBacktickRuns(markdown);
  const indexesToUnescape = new Set<number>();

  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];

    if (run.length >= 3) {
      const closingRun = runs
        .slice(index + 1)
        .find(
          (candidate) =>
            candidate.length >= 3 && runEndsLine(markdown, candidate),
        );

      if (closingRun) {
        markRun(run, indexesToUnescape);
        markRun(closingRun, indexesToUnescape);
      }

      continue;
    }

    const closingRun = runs
      .slice(index + 1)
      .find((candidate) => candidate.length === run.length);

    if (closingRun) {
      markRun(run, indexesToUnescape);
      markRun(closingRun, indexesToUnescape);
    }
  }

  let normalized = "";
  for (let index = 0; index < markdown.length; index += 1) {
    if (indexesToUnescape.has(index)) {
      normalized += "`";
      index += ESCAPED_BACKTICK.length - 1;
    } else {
      normalized += markdown[index];
    }
  }

  return normalized;
}
