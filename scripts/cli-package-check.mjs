import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "marka-packed-cli-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const packed = JSON.parse(
    execFileSync(
      npm,
      [
        "pack",
        join(root, "apps/cli"),
        "--pack-destination",
        directory,
        "--json",
      ],
      { cwd: directory, encoding: "utf8" },
    ),
  )[0];
  assert(packed.files.some((file) => file.path === "dist/index.mjs"));
  assert(packed.files.some((file) => file.path === "dist/LICENSE"));
  assert(
    !packed.files.some((file) => /(^|\/)\.env|(^|\/)src\//.test(file.path)),
  );
  const install = join(directory, "installed");
  execFileSync(
    npm,
    [
      "install",
      "--prefix",
      install,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      join(directory, packed.filename),
    ],
    { stdio: "inherit" },
  );
  const packageRoot = join(install, "node_modules/@absolutepraya/marka");
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(manifest.engines.node, ">=22");
  assert.equal(
    readFileSync(join(packageRoot, "dist/LICENSE"), "utf8"),
    readFileSync(join(root, "LICENSE"), "utf8"),
  );
  assert.equal(manifest.bin.marka, "dist/index.mjs");
  assert.equal(manifest.bin.karakeep, "dist/index.mjs");
  const binary = join(packageRoot, "dist/index.mjs");
  assert.match(readFileSync(binary, "utf8"), /^#!\/usr\/bin\/env node\n/);
  if (process.platform !== "win32") {
    assert(statSync(binary).mode & 0o111);
    for (const alias of ["marka", "karakeep"]) {
      const output = execFileSync(
        process.execPath,
        [join(install, "node_modules/.bin", alias), "--version"],
        { cwd: directory, encoding: "utf8" },
      );
      assert.equal(output.trim(), manifest.version);
    }
  }
  execFileSync(
    process.execPath,
    [
      resolve(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "--config",
      "vitest.cli.config.ts",
    ],
    {
      cwd: join(root, "packages/trpc"),
      env: { ...process.env, MARKA_CLI_BINARY: binary },
      stdio: "inherit",
    },
  );
  console.log(
    "Packed CLI installation, aliases, and integration checks passed",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
