// Render the editable HTML with the repository's Playwright installation.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const directory = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(directory, "png/_preview"), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 992, height: 668 },
    deviceScaleFactor: 2,
  });
  await page.goto("file://" + path.join(directory, "src/architecture.html"));
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const overflow = [...document.querySelectorAll(".node,.caption,.legend")]
      .filter(
        (element) =>
          element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1,
      )
      .map((element) => element.textContent);
    const label = document
      .querySelector(".optional-label")
      .getBoundingClientRect();
    const heading = document
      .querySelector(".optional h4")
      .getBoundingClientRect();
    return {
      fontLoaded: document.fonts.check("700 23px Montserrat"),
      overflow,
      optionalLabelClear: label.bottom < heading.top,
      nodes: document.querySelectorAll(".node").length,
    };
  });
  assert(result.fontLoaded, "Montserrat must be loaded");
  assert.equal(result.overflow.length, 0, "Text must fit its cards");
  assert(result.optionalLabelClear, "Optional label must clear the heading");
  await page.locator("#w").screenshot({
    path: path.join(directory, "png/architecture.png"),
    omitBackground: true,
  });
  await page.addStyleTag({ content: "body{background:#fff}" });
  await page.locator("#w").screenshot({
    path: path.join(directory, "png/_preview/architecture.png"),
  });
  fs.copyFileSync(
    path.join(directory, "png/_preview/architecture.png"),
    path.join(directory, "png/architecture-readme.png"),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
