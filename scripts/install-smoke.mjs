import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

// Disposable integration-test account only. Never print credentials or response bodies.
const [phase, baseUrl, proofPath] = process.argv.slice(2);
const marker = "markainstallersmokeproof";
let proof;
let apiKey;

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

async function trpc(procedure, input) {
  const response = await request(`/api/trpc/${procedure}`, {
    method: "POST",
    body: { json: input },
  });
  assert(response.result?.data?.json, `${procedure} did not return data`);
  return response.result.data.json;
}

async function waitFor(description, check) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await setTimeout(2000);
  }
  throw new Error(`Timed out: ${description}`);
}

async function verifyBookmark() {
  const bookmark = await request(
    `/api/v1/bookmarks/${proof.bookmarkId}?includeContent=true`,
  );
  assert(bookmark.content.title.includes(marker), "Rendered title was lost");
  assert(
    bookmark.content.htmlContent.includes("Browser executed successfully"),
    "JavaScript-rendered content was not crawled",
  );
  const screenshot = bookmark.assets.find(
    (asset) => asset.assetType === "screenshot",
  );
  assert(screenshot, "Screenshot asset is missing");
  const image = await fetch(`${baseUrl}/api/v1/assets/${screenshot.id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  assert(image.ok, "Screenshot cannot be downloaded");
  assert((await image.arrayBuffer()).byteLength > 100, "Screenshot is empty");
  await waitFor("full-text search", async () => {
    const result = await request(`/api/v1/bookmarks/search?q=${marker}`);
    return result.bookmarks.some((item) => item.id === proof.bookmarkId);
  });
}

if (phase === "seed") {
  const password = randomBytes(24).toString("hex");
  const email = "installer-test@example.com";
  const user = await trpc("users.create", {
    name: "Installer Test",
    email,
    password,
    confirmPassword: password,
  });
  assert.equal(user.role, "admin", "First account must be an administrator");
  ({ key: apiKey } = await trpc("apiKeys.exchange", {
    email,
    password,
    keyName: "Disposable installer smoke test",
  }));
  const bookmark = await request("/api/v1/bookmarks", {
    method: "POST",
    body: { type: "link", url: "http://installer-fixture/proof.html" },
  });
  proof = { apiKey, bookmarkId: bookmark.id };
  await writeFile(proofPath, JSON.stringify(proof), { mode: 0o600 });
  await waitFor("browser crawling and screenshot", async () => {
    const current = await request(
      `/api/v1/bookmarks/${bookmark.id}?includeContent=true`,
    );
    return (
      current.content.title?.includes(marker) &&
      current.assets.some((asset) => asset.assetType === "screenshot")
    );
  });
  await verifyBookmark();
  console.log(
    "PASS: first administrator, API login, rendered crawl, screenshot, search",
  );
} else {
  proof = JSON.parse(await readFile(proofPath, "utf8"));
  apiKey = proof.apiKey;
  if (phase === "after-backup") {
    const late = await request("/api/v1/bookmarks", {
      method: "POST",
      body: { type: "text", text: "Created after the backup" },
    });
    proof.afterBackupId = late.id;
    await writeFile(proofPath, JSON.stringify(proof), { mode: 0o600 });
  } else if (phase === "verify" || phase === "restored") {
    await verifyBookmark();
    if (phase === "restored") {
      const result = await request("/api/v1/bookmarks");
      assert(
        !result.bookmarks.some((item) => item.id === proof.afterBackupId),
        "Restore kept data created after the backup",
      );
    }
    console.log(`PASS: ${phase} data, API access, screenshot bytes, search`);
  } else throw new Error("Unknown installer smoke-test phase");
}
