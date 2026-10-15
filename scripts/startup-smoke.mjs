import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const baseUrl = process.env.MARKA_STARTUP_BASE_URL ?? "http://localhost:3000";
const storageState = process.env.MARKA_STARTUP_STORAGE_STATE;
if (!storageState)
  throw new Error(
    "Set MARKA_STARTUP_STORAGE_STATE to a signed-in Playwright storage-state file for the complete launch matrix.",
  );
const browser = await chromium.launch();
const results = [];
const dir = process.env.MARKA_STARTUP_REPORT_DIR ?? ".dev/startup";
await mkdir(dir, { recursive: true });
async function test(name, run) {
  if (
    process.env.MARKA_STARTUP_CASE &&
    !name.includes(process.env.MARKA_STARTUP_CASE)
  )
    return;
  const begin = Date.now();
  try {
    await run();
    results.push({ name, status: "pass", elapsedMs: Date.now() - begin });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "fail", error: e.message });
    console.log("FAIL", name, e.stack);
  }
  await writeFile(
    `${dir}/browser-results.json`,
    JSON.stringify(results, null, 2),
  );
}
async function context({
  signedIn = false,
  theme = "light",
  motion = "no-preference",
  width = 390,
  height = 844,
  serviceWorkers = "block",
} = {}) {
  const ctx = await browser.newContext({
    serviceWorkers,
    ...(signedIn ? { storageState } : {}),
    viewport: { width, height },
    colorScheme: theme,
    reducedMotion: motion,
    isMobile: width < 768,
    hasTouch: width < 768,
    userAgent:
      width < 768
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0",
  });

  return ctx;
}
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.documentElement?.dataset.startupReady === "true" &&
      document.getElementById("marka-startup-content")?.inert === false,
    {},
    { timeout: 60000 },
  );
  assert.equal(
    await page.locator("#marka-startup-content").evaluate((e) => e.inert),
    false,
  );
  assert.equal(
    await page
      .locator(".marka-startup")
      .evaluate((e) => getComputedStyle(e).display),
    "none",
  );
}
for (const signedIn of [false, true])
  for (const theme of ["light", "dark"]) {
    await test(`${signedIn ? "signed-in" : "signed-out"} ${theme} slow launch, blocked fonts, fresh and repeat visits`, async () => {
      const ctx = await context({ signedIn, theme });
      const page = await ctx.newPage();
      await page.route("**/*", async (route) => {
        const url = route.request().url();
        if (/\.(woff2?|ttf)(\?|$)/.test(url)) return route.abort();
        if (url.includes("/_next/") && url.endsWith(".js"))
          await new Promise((r) => setTimeout(r, 1800));
        await route.continue();
      });
      for (let visit = 0; visit < 2; visit++) {
        await page.goto(
          `${baseUrl}/${signedIn ? "dashboard/bookmarks" : "signin"}`,
          { waitUntil: "commit" },
        );
        await page
          .locator(".marka-startup")
          .waitFor({ state: "visible", timeout: 60000 });
        assert.equal(
          await page
            .locator(".marka-startup")
            .evaluate((e) => getComputedStyle(e).fontFamily),
          "system-ui, sans-serif",
        );
        const bg = await page
          .locator(".marka-startup")
          .evaluate((e) => getComputedStyle(e).backgroundColor);
        assert.equal(
          bg,
          theme === "dark" ? "rgb(18, 26, 39)" : "rgb(245, 247, 250)",
        );
        await page.screenshot({
          path: `${dir}/${signedIn ? "in" : "out"}-${theme}-${visit}-loading.png`,
        });
        await ready(page);

        if (!signedIn) {
          const input = page.locator("input[type=email]");
          await input.fill("startup-test@example.invalid");
          assert.equal(
            await input.inputValue(),
            "startup-test@example.invalid",
          );
        }
      }
      await ctx.close();
    });
  }
await test("fast signed-out root and protected direct URL redirect; no minimum delay", async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  for (const path of ["/", "/dashboard/bookmarks", "/signin"]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/signin");
    await ready(page);
  }
  await ctx.close();
});
await test("signed-in root redirect and direct settings entry; client navigation and resume do not replay", async () => {
  const ctx = await context({ signedIn: true });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/dashboard/bookmarks");
  await ready(page);
  await page.locator('a[href="/dashboard/tags"]:visible').first().click();
  await page.waitForURL("**/dashboard/tags");
  await ready(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await ready(page);
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.startupRecovery),
    undefined,
  );
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/settings/info");
  await ready(page);
  await ctx.close();
});
await test("readiness does not wait for background requests or bookmark images", async () => {
  const ctx = await context({ signedIn: true });
  const page = await ctx.newPage();
  const held = [];
  await page.route("**/api/trpc/**", (route) => {
    held.push(route);
  });
  await page.route("**/api/assets/**", (route) => {
    held.push(route);
  });
  await page.goto(`${baseUrl}/dashboard/bookmarks`, {
    waitUntil: "domcontentloaded",
  });
  await ready(page);
  await page.getByRole("combobox").first().focus();
  for (const route of held) await route.abort();
  await ctx.close();
});
await test("saved light preference overrides dark OS before hydration; reduced motion and viewport changes", async () => {
  const ctx = await context({ theme: "dark", motion: "reduce" });
  await ctx.addCookies([{ name: "theme", value: "light", url: baseUrl }]);
  const page = await ctx.newPage();
  await page.route("**/_next/**/*.js", async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await r.continue();
  });
  await page.goto(`${baseUrl}/signin`, { waitUntil: "commit" });
  await page.locator(".marka-startup").waitFor({ state: "visible" });
  assert.equal(
    await page
      .locator(".marka-startup")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(245, 247, 250)",
  );
  assert.equal(
    await page
      .locator(".marka-startup-indicator")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.setViewportSize({ width: 740, height: 390 });
  assert.equal(
    await page
      .locator(".marka-startup")
      .evaluate((e) => getComputedStyle(e).display),
    "flex",
  );
  await ready(page);
  await ctx.close();
});
await test("stalled JavaScript exposes accessible recovery and retry; restored stalled page stays blocked", async () => {
  const ctx = await context();
  const page = await ctx.newPage();
  let fail = true;
  await page.route("**/_next/**/*.js", (r) =>
    fail ? r.abort() : r.continue(),
  );
  await page.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.documentElement.dataset.startupRecovery === "slow",
    {},
    { timeout: 25000 },
  );
  assert.equal(
    await page
      .locator(".marka-startup [role=status]")
      .getAttribute("aria-live"),
    "polite",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.startupReady),
    undefined,
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.startupReady),
    undefined,
  );
  await page.screenshot({ path: `${dir}/recovery.png` });
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await ready(page);
  await ctx.close();
});
await test("desktop loader hidden during stalled hydration", async () => {
  const ctx = await context({ width: 1280, height: 800 });
  const page = await ctx.newPage();
  await page.route("**/_next/**/*.js", (r) => r.abort());
  await page.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  assert.equal(
    await page
      .locator(".marka-startup")
      .evaluate((e) => getComputedStyle(e).display),
    "none",
  );
  await ctx.close();
});
await test("cold offline navigation uses existing service-worker fallback", async () => {
  const ctx = await context({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/signin`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await ctx.setOffline(true);
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  assert(
    (await page.locator("body").innerText()).includes(
      "Marka needs an internet connection when you open the app.",
    ),
  );
  assert.equal(await page.locator(".marka-startup").count(), 0);
  await ctx.close();
});
if (process.env.MARKA_STARTUP_FAILURE_BASE_URL) {
  await test("startup server error replaces the loader with interactive recovery", async () => {
    const ctx = await context({ signedIn: true });
    const page = await ctx.newPage();
    await page.goto(
      `${process.env.MARKA_STARTUP_FAILURE_BASE_URL}/dashboard/bookmarks`,
      { waitUntil: "domcontentloaded" },
    );
    await page
      .getByRole("heading", { name: "Marka couldn't start" })
      .waitFor({ timeout: 60000 });
    assert.equal(await page.locator(".marka-startup").count(), 0);
    const retry = page.getByRole("button", { name: "Try again" });
    await retry.focus();
    assert.equal(
      await retry.evaluate((el) => el === document.activeElement),
      true,
    );
    await page.screenshot({ path: `${dir}/server-error.png` });
    await ctx.close();
  });
}
await browser.close();
if (results.some((r) => r.status === "fail")) process.exitCode = 1;
