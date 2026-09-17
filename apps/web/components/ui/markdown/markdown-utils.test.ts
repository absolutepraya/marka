import { describe, expect, it } from "vitest";
import { normalizeEscapedCodeDelimiters } from "./markdown-utils";

describe("normalizeEscapedCodeDelimiters", () => {
  it("repairs paired escaped inline code delimiters", () => {
    expect(
      normalizeEscapedCodeDelimiters("Inline: \\`const answer = 42;\\`"),
    ).toBe("Inline: `const answer = 42;`");
  });

  it("repairs escaped fenced code delimiters", () => {
    const escapedMarkdown =
      "\\`\\`\\`typescript\nconst answer = 42;\n\\`\\`\\`";

    expect(normalizeEscapedCodeDelimiters(escapedMarkdown)).toBe(
      "```typescript\nconst answer = 42;\n```",
    );
  });

  it("keeps unpaired escaped backticks literal", () => {
    const markdown = "A literal backtick: \\`";

    expect(normalizeEscapedCodeDelimiters(markdown)).toBe(markdown);
  });

  it("does not reuse a paired delimiter as the next opener", () => {
    const markdown = "A: \\`one\\` B: \\`two";

    expect(normalizeEscapedCodeDelimiters(markdown)).toBe("A: `one` B: \\`two");
  });

  it("keeps a shorter closing fence escaped", () => {
    const markdown = "\\`\\`\\`\\`typescript\nconst answer = 42;\n\\`\\`\\`";

    expect(normalizeEscapedCodeDelimiters(markdown)).toBe(markdown);
  });
});
