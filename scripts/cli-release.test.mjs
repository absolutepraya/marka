import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, parseCliTag, decideCliRelease } from "./cli-release.mjs";
const hash = "a".repeat(64);
const previous = {
  tag: "marka-cli/v0.1.0",
  version: "0.1.0",
  sha: "old",
  fingerprint: hash,
};
const base = {
  previous,
  target: "new",
  currentFingerprint: "b".repeat(64),
  commits: [],
};

test("fingerprint ignores source version and development dependencies but detects bundle and bin changes", () => {
  const manifest = {
    name: "@absolutepraya/marka",
    version: "0.32.0",
    bin: { marka: "dist/index.mjs" },
  };
  const original = fingerprint("bundle", manifest);
  assert.equal(
    original,
    fingerprint("bundle", {
      ...manifest,
      version: "1.0.0",
      devDependencies: { react: "1" },
    }),
  );
  assert.notEqual(original, fingerprint("new bundle", manifest));
  assert.notEqual(original, fingerprint("bundle", { ...manifest, bin: {} }));
});
test("only Marka CLI tags with valid release metadata are accepted", () => {
  assert.equal(parseCliTag("cli/v0.32.0", "invalid", "old"), null);
  assert.equal(parseCliTag("marka-cli/v01.0.0", "invalid", "old"), null);
  assert.throws(() => parseCliTag("marka-cli/v0.1.0", "{}", "old"));
  assert.equal(
    parseCliTag(
      previous.tag,
      JSON.stringify({ package: "@absolutepraya/marka", fingerprint: hash }),
      "old",
    ).version,
    "0.1.0",
  );
});
test("initial release starts at 0.1.0 and unchanged artifacts skip unrelated features", () => {
  assert.equal(decideCliRelease({ ...base, previous: null }).version, "0.1.0");
  assert.equal(
    decideCliRelease({
      ...base,
      currentFingerprint: hash,
      commits: [{ subject: "feat: web", files: ["apps/web/page.tsx"] }],
    }).shouldRelease,
    false,
  );
});
test("CLI features and breaking changes independently bump versions", () => {
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [
        { subject: "feat(cli): search", files: ["apps/cli/src/index.ts"] },
      ],
    }).version,
    "0.2.0",
  );
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [
        {
          subject: "feat(cli)!: incompatible",
          files: ["apps/cli/src/index.ts"],
        },
      ],
    }).version,
    "1.0.0",
  );
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [{ subject: "feat: web", files: ["apps/web/page.tsx"] }],
    }).version,
    "0.1.1",
  );
});
test("changed bundled dependencies release while docs do not cause a minor bump", () => {
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [{ subject: "deps: update", files: ["pnpm-lock.yaml"] }],
    }).version,
    "0.1.1",
  );
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [{ subject: "feat: examples", files: ["apps/cli/README.md"] }],
    }).version,
    "0.1.1",
  );
});
test("retry reserved version, reject different build, skip older CI completion", () => {
  assert.equal(
    decideCliRelease({ ...base, target: "old", currentFingerprint: hash })
      .version,
    "0.1.0",
  );
  assert.throws(() => decideCliRelease({ ...base, target: "old" }));
  assert.equal(
    decideCliRelease({ ...base, covered: true }).shouldRelease,
    false,
  );
});

test("publication verification rejects wrong commit and missing executable aliases", async () => {
  const { validatePublishedVersion } = await import("./cli-publication.mjs");
  const decision = { version: "0.1.0", target: "abc" };
  const metadata = {
    name: "@absolutepraya/marka",
    version: "0.1.0",
    gitHead: "abc",
    bin: { marka: "dist/index.mjs", karakeep: "dist/index.mjs" },
  };
  assert.doesNotThrow(() => validatePublishedVersion(metadata, decision));
  assert.throws(() =>
    validatePublishedVersion({ ...metadata, gitHead: "wrong" }, decision),
  );
  assert.throws(() =>
    validatePublishedVersion(
      { ...metadata, bin: { marka: "dist/index.mjs" } },
      decision,
    ),
  );
});

test("real Git release history supports initial release, reserved retry, and unchanged artifact", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "marka-cli-release-"));
  const script = resolve("scripts/cli-release.mjs");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const run = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["--import", join(directory, "registry.mjs"), script],
        {
          cwd: directory,
          encoding: "utf8",
        },
      ),
    );
  try {
    writeFileSync(
      join(directory, "registry.mjs"),
      'globalThis.fetch = async () => { throw new Error("Unexpected registry request"); };\n',
    );
    git("init", "--initial-branch=main");
    git("config", "user.email", "cli-test@example.com");
    git("config", "user.name", "CLI release test");
    git("remote", "add", "origin", directory);
    mkdirSync(join(directory, "apps/cli/dist"), { recursive: true });
    writeFileSync(join(directory, "apps/cli/dist/index.mjs"), "bundle");
    writeFileSync(
      join(directory, "apps/cli/package.json"),
      JSON.stringify({ name: "@absolutepraya/marka", version: "0.0.0" }),
    );
    git("add", ".");
    git("commit", "-m", "feat(cli): first release");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    const initial = run();
    assert.equal(initial.tag, "marka-cli/v0.1.0");
    git(
      "tag",
      "-a",
      initial.tag,
      "-m",
      JSON.stringify({
        package: "@absolutepraya/marka",
        fingerprint: initial.fingerprint,
      }),
    );
    assert.equal(run().reason, "Retry reserved CLI release");
    writeFileSync(
      join(directory, "registry.mjs"),
      `globalThis.fetch = async () => new Response(JSON.stringify(${JSON.stringify({ name: "@absolutepraya/marka", version: "0.1.0", gitHead: initial.target, bin: { marka: "dist/index.mjs", karakeep: "dist/index.mjs" } })}), {status: 200});`,
    );
    writeFileSync(join(directory, "README.md"), "documentation");
    git("add", ".");
    git("commit", "-m", "docs: explain setup");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    assert.equal(run().shouldRelease, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a pending publication blocks new versions but permits the reserved target retry", () => {
  assert.throws(
    () => decideCliRelease({ ...base, previousPublished: false }),
    /Unpublished reserved CLI release/,
  );
  assert.equal(
    decideCliRelease({
      ...base,
      target: "old",
      currentFingerprint: hash,
      previousPublished: false,
    }).version,
    "0.1.0",
  );
});

test("an explicit Release none footer suppresses a scoped CLI release", () => {
  assert.equal(
    decideCliRelease({
      ...base,
      commits: [
        {
          subject: "fix(cli): deferred change",
          body: "Release: none",
          files: ["apps/cli/src/index.ts"],
        },
      ],
    }).shouldRelease,
    false,
  );
});
