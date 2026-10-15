import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

for (const withEnv of [false, true]) {
  test(`dev check handles ${withEnv ? "configured" : "missing"} .env`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "marka-dev-check-"));
    try {
      if (withEnv)
        writeFileSync(
          join(cwd, ".env"),
          "KARAKEEP_PORT=4017\nWORKERS_PORT=14019\n",
        );
      const urls = withEnv
        ? ["http://127.0.0.1:4017/api/health", "http://127.0.0.1:14019/ready"]
        : ["http://127.0.0.1:3000/api/health", "http://127.0.0.1:13000/ready"];
      const mock = `const urls=${JSON.stringify(urls)};globalThis.fetch=async(url)=>{if(!urls.includes(url))throw Error('Unexpected URL');return {ok:true}};`;
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "data:text/javascript," + encodeURIComponent(mock),
          fileURLToPath(new URL("./check-dev.mjs", import.meta.url)),
        ],
        { cwd, encoding: "utf8", env: { PATH: process.env.PATH } },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Web health: ready/);
      assert.match(result.stdout, /Worker readiness: ready/);
      assert.doesNotMatch(result.stderr, /ENOENT/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
