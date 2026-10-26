// Isolated renderer probe using Marka's connector and HTML parser subprocess.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBrowserlessWebSocketUrl } from "../../apps/workers/browserlessConnector.ts";

const workerRoot = fileURLToPath(
  new URL("../../apps/workers/", import.meta.url),
);
const requireWorker = createRequire(`${workerRoot}package.json`);
const { chromium } = requireWorker("playwright");
const [info] = JSON.parse(
  execFileSync(
    "docker",
    [
      "inspect",
      process.env.MARKA_BROWSERLESS_TEST_CONTAINER ??
        "marka-upgrade-browserless",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ),
);
const binding = info.HostConfig.PortBindings["3000/tcp"][0];
assert.equal(binding.HostIp, "127.0.0.1");
const token = info.Config.Env.find((entry) =>
  entry.startsWith("TOKEN="),
)?.slice(6);
assert.ok(token);
const output = process.env.MARKA_UPGRADE_ARTIFACT_DIR;
assert.ok(output && isAbsolute(output), "Set an absolute artifact directory");
const url = buildBrowserlessWebSocketUrl(
  `ws://127.0.0.1:${binding.HostPort}/?timeout=0`,
  token,
  true,
);
let browser;
try {
  browser = await chromium.connectOverCDP(url, { timeout: 5000 });
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    const article =
      "This isolated article verifies browser rendering and readable content extraction. ".repeat(
        20,
      );
    await context.route("**/*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<html><head><title>Marka compatibility article</title><meta property="og:title" content="Marka compatibility article"><meta name="description" content="Synthetic renderer fixture"><link rel="icon" href="data:,"></head><body><article><h1>Marka compatibility article</h1><p>${article}</p><p id="dynamic"></p></article><script>document.querySelector('#dynamic').textContent='JavaScript executed successfully';</script></body></html>`,
      }),
    );
    const page = await context.newPage();
    await page.goto("https://crawler-fixture.invalid/article");
    assert.equal(await page.title(), "Marka compatibility article");
    assert.equal(
      await page.locator("#dynamic").textContent(),
      "JavaScript executed successfully",
    );
    const htmlContent = await page.content();
    const jpeg = await page.screenshot({
      type: "jpeg",
      fullPage: false,
      quality: 80,
    });
    assert.equal(jpeg.subarray(0, 2).toString("hex"), "ffd8");
    assert.ok(jpeg.length > 1000);
    writeFileSync(`${output}/marka-renderer-fixture.jpg`, jpeg);
    const parsed = JSON.parse(
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/parseHtmlSubprocess.ts"],
        {
          cwd: workerRoot,
          env: { ...process.env, NODE_ENV: "test", NO_COLOR: "false" },
          input: JSON.stringify({
            htmlContent,
            url: page.url(),
            jobId: "upgrade-fixture",
          }),
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 30000,
        },
      ),
    );
    assert.equal(parsed.metadata.title, "Marka compatibility article");
    assert.ok(
      parsed.readableContent.content.includes("readable content extraction"),
    );
    assert.ok(
      parsed.readableContent.content.includes(
        "JavaScript executed successfully",
      ),
    );
    assert.ok(!parsed.readableContent.content.includes("<script"));
    console.log(
      "MARKA_RENDERER_CONTENT",
      JSON.stringify({
        browser: browser.version(),
        jpegBytes: jpeg.length,
        checks: [
          "CDP",
          "JavaScript",
          "HTML",
          "JPEG",
          "metadata",
          "readability",
          "sanitization",
        ],
      }),
    );
  } finally {
    await context.close();
  }
} catch (error) {
  throw new Error(String(error).replaceAll(token, "<redacted>"));
} finally {
  await browser?.close();
}
