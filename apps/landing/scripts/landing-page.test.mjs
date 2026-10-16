import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const html = await readFile(
  resolve(scriptDirectory, "../dist/index.html"),
  "utf8",
);

test("keeps the complete static product story in semantic page order", () => {
  const sections = [
    'data-page-section="hero"',
    'data-page-section="product-preview"',
    'data-page-section="source-library"',
    'data-page-section="desktop-demos"',
    'data-page-section="mobile-library"',
    'data-page-section="ownership-close"',
    'data-page-section="footer"',
  ];
  const positions = sections.map((section) => html.indexOf(section));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
});

test("keeps every familiar save and both destinations visible without JavaScript", () => {
  for (const contentType of [
    "Movie watchlists",
    "E-commerce wishlists",
    "Places and stays",
    "Career tips",
    "Engineering articles",
    "UI references",
    "Course material",
  ]) {
    assert.ok(
      html.includes(contentType),
      `missing static example: ${contentType}`,
    );
  }

  assert.ok(html.includes("readable content and summaries when available"));
  assert.ok(html.includes('href="#demos"'));
  assert.ok(html.includes('href="https://marka.abhipraya.dev/"'));
  assert.match(html, /\/marketing\/source-cards\/movies\.webp/);
  assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//i);
});
