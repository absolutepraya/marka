import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspectPublicMarkup } from "./verify-public-site.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const staleBrandingFixture = await readFile(
  resolve(scriptDirectory, "fixtures/stale-branding.html"),
  "utf8",
);

test("rejects an inherited Karakeep URL in public markup", () => {
  assert.throws(() => inspectPublicMarkup(staleBrandingFixture), /karakeep/i);
});
