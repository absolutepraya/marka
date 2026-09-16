import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = await readFile(
  require.resolve("axe-core/axe.min.js"),
  "utf8",
);

const baseUrl = process.env.MARKA_READER_BASE_URL ?? "http://localhost:3000";
const bookmarkId = process.env.MARKA_READER_BOOKMARK_ID;
const email = process.env.MARKA_READER_EMAIL;
const password = process.env.MARKA_READER_PASSWORD;
const storageState = process.env.MARKA_READER_STORAGE_STATE;
const screenshotDir = path.resolve(
  process.env.MARKA_READER_SCREENSHOT_DIR ?? ".playwright-mcp/reader-view",
);
const readerUrl = `${baseUrl.replace(/\/$/, "")}/reader/${bookmarkId ?? ""}`;

function requireValue(name, value) {
  if (!value) {
    throw new Error(`Set ${name} before running the Reader View smoke test.`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(page) {
  requireValue("MARKA_READER_EMAIL", email);
  requireValue("MARKA_READER_PASSWORD", password);

  await page.goto(`${baseUrl.replace(/\/$/, "")}/signin`, {
    waitUntil: "networkidle",
  });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/signin"), {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

async function ensureAuthenticated(page) {
  await page.goto(readerUrl, { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname.endsWith("/signin")) {
    await signIn(page);
    await page.goto(readerUrl, { waitUntil: "networkidle" });
  }
}

async function runAxe(page) {
  await page.addScriptTag({ content: axeSource });
  const result = await page
    .locator("main article")
    .evaluate(async (article) => {
      return window.axe.run(article, { resultTypes: ["violations"] });
    });

  if (result.violations.length > 0) {
    const summary = result.violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.nodes.map((node) => node.html).join(", ")}`,
      )
      .join("\n");
    throw new Error(`axe found Reader View violations:\n${summary}`);
  }
}

async function saveScreenshot(page, name) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
  });
}

const browser = await chromium.launch({
  headless: process.env.MARKA_READER_HEADFUL !== "1",
});
const context = await browser.newContext({
  ...(storageState ? { storageState } : {}),
  colorScheme: "light",
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const imageRequests = [];
page.on("request", (request) => {
  if (request.resourceType() === "image") imageRequests.push(request.url());
});

try {
  await mkdir(screenshotDir, { recursive: true });
  requireValue("MARKA_READER_BOOKMARK_ID", bookmarkId);
  await ensureAuthenticated(page);

  await page.locator('input[type="search"]').waitFor({ timeout: 30_000 });
  await page.locator("[data-reader-heading]").first().waitFor({
    timeout: 30_000,
  });
  const headingCount = await page.locator("[data-reader-heading]").count();
  assert(
    headingCount >= 2,
    "The smoke fixture must contain at least two headings.",
  );
  const unsafeMarkupCount = await page
    .locator(
      "main article script, main article style, main article form, main article iframe, main article svg, main article [onclick], main article [onerror]",
    )
    .count();
  assert(
    unsafeMarkupCount === 0,
    "Reader View must not inject active markup or event-handler attributes.",
  );
  const unsafeUrlCount = await page
    .locator(
      'main article [href^="javascript:"], main article [href^="data:"], main article [href^="blob:"], main article [src^="data:"], main article [src^="blob:"]',
    )
    .count();
  assert(
    unsafeUrlCount === 0,
    "Reader View must not expose unsafe resource URLs.",
  );

  await runAxe(page);

  const tableOfContents = page.getByRole("button", {
    name: "Table of contents",
  });
  await tableOfContents.click();
  const tableOfContentsNav = page.getByRole("navigation", {
    name: "Table of contents",
  });
  await tableOfContentsNav.waitFor();
  await page.keyboard.press("Escape");
  assert(
    await tableOfContents.evaluate(
      (element) => element === document.activeElement,
    ),
    "Escape must return focus to the table-of-contents trigger.",
  );
  await tableOfContents.click();
  await tableOfContentsNav.getByRole("button").first().click();
  assert(
    await page.evaluate(() =>
      document.activeElement?.matches("[data-reader-heading]"),
    ),
    "Selecting a table-of-contents entry must focus its heading.",
  );

  const search = page.locator('input[type="search"]');
  await search.fill("Alpha");
  await search.press("Enter");
  assert(
    (await page.locator("[data-reader-search-current]").count()) === 1,
    "Search must expose one current match.",
  );
  await page.keyboard.press("Escape");
  assert(
    (await search.inputValue()) === "" &&
      (await search.evaluate((element) => element === document.activeElement)),
    "Escape must clear search and restore focus to the search input.",
  );

  await saveScreenshot(page, "desktop-light-normal.png");
  await tableOfContents.click();
  await saveScreenshot(page, "desktop-light-table-of-contents.png");
  await tableOfContents.click();
  await search.fill("Alpha");
  await saveScreenshot(page, "desktop-light-search.png");
  await search.fill("");

  await page.emulateMedia({ colorScheme: "dark" });
  await saveScreenshot(page, "desktop-dark-normal.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await saveScreenshot(page, "mobile-light-normal.png");
  await page.emulateMedia({ colorScheme: "dark" });
  await saveScreenshot(page, "mobile-dark-normal.png");

  await page.emulateMedia({ media: "print", colorScheme: "light" });
  await saveScreenshot(page, "print-light.png");

  const expectedImageUrl = process.env.MARKA_READER_EXPECTED_IMAGE_URL;
  if (expectedImageUrl) {
    assert(
      imageRequests.some((url) => url === expectedImageUrl),
      `Expected Reader View image request was not observed: ${expectedImageUrl}`,
    );
  }

  const forbiddenUrl = process.env.MARKA_READER_FORBIDDEN_URL;
  if (forbiddenUrl) {
    assert(
      !imageRequests.some((url) => url === forbiddenUrl),
      `A forbidden Reader View resource was requested: ${forbiddenUrl}`,
    );
  }

  console.log(`Reader View smoke passed for ${readerUrl}`);
  console.log(`Screenshots written to ${screenshotDir}`);
  if (imageRequests.length > 0) {
    console.log(`Observed ${imageRequests.length} image request(s).`);
  }
} finally {
  await context.close();
  await browser.close();
}
