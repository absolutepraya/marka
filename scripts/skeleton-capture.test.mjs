import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { localCaptureUrl, writeBonesAtomically } from "./skeleton-capture.mjs";

test("capture accepts only loopback HTTP", () => {
  for (const url of [
    "http://localhost:4025",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])
    assert.equal(localCaptureUrl(url).protocol, "http:");
  for (const url of [
    "https://localhost",
    "http://example.com",
    "file:///tmp/test",
    "http://localhost.example.com",
  ])
    assert.throws(() => localCaptureUrl(url));
});

test("capture replaces valid JSON and cleans up after a failed rename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "marka-bones-test-"));
  try {
    const target = join(dir, "capture.json");
    await writeFile(target, '{"old":true}\n');
    await writeBonesAtomically(target, { complete: true });
    assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
      complete: true,
    });
    assert.deepEqual(await readdir(dir), ["capture.json"]);
    const blocked = join(dir, "blocked");
    await mkdir(blocked);
    await assert.rejects(writeBonesAtomically(blocked, { complete: true }));
    assert.deepEqual((await readdir(dir)).sort(), ["blocked", "capture.json"]);
    assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
      complete: true,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
