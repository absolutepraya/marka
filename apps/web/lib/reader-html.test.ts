// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { sanitizeReaderHtml } from "./reader-html";

describe("sanitizeReaderHtml", () => {
  test("removes active content and preserves safe article content", () => {
    const html = sanitizeReaderHtml(
      `<article>
        <h2 id="intro">Intro</h2>
        <p onclick="alert(1)">Hello <strong>reader</strong></p>
        <script>window.pwned = true</script>
        <style>body { display: none }</style>
        <form><input value="secret"><button>Submit</button></form>
        <iframe src="https://third-party.example/embed"></iframe>
        <svg><script>alert(1)</script></svg>
        <img src="images/photo.png" onerror="alert(1)" alt="Photo">
        <a href="javascript:alert(1)">Unsafe</a>
        <a href="#intro">Section</a>
        <a href="https://example.com" target="_blank">External</a>
      </article>`,
      "https://source.example/articles/reader",
    );

    expect(html).toContain("<strong>reader</strong>");
    expect(html).not.toMatch(
      /script|style|form|input|button|iframe|svg|onclick|onerror/i,
    );
    expect(html).toContain(
      'src="https://source.example/articles/images/photo.png"',
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#intro"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  test("rejects data, blob, and protocol-relative resource URLs", () => {
    const html = sanitizeReaderHtml(
      `<img src="data:image/png;base64,abc"><img src="blob:https://source.example/id"><img src="//cdn.example/photo.png">`,
    );

    expect(html).not.toContain("data:");
    expect(html).not.toContain("blob:");
    expect(html).not.toContain("cdn.example");
  });
});
