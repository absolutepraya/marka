import assert from "node:assert/strict";
import test from "node:test";

import {
  bumpVersion,
  classifyCommit,
  decideRelease,
  determineBump,
  latestReleaseTag,
  parseRemoteReleaseRefs,
} from "./release-version.mjs";

test("classifies conventional release levels", () => {
  assert.equal(classifyCommit({ subject: "feat: add notes" }).level, "minor");
  assert.equal(
    classifyCommit({ subject: "fix: handle empty feeds" }).level,
    "patch",
  );
  assert.equal(
    classifyCommit({ subject: "feat!: replace the API contract" }).level,
    "major",
  );
  assert.equal(
    classifyCommit({
      subject: "refactor: replace the API contract",
      body: "BREAKING CHANGE: clients must migrate",
    }).level,
    "major",
  );
  assert.equal(
    classifyCommit({
      subject: "refactor: replace the API contract",
      body: "BREAKING-CHANGE: clients must migrate",
    }).level,
    "major",
  );
});

test("does not release documentation-only changes", () => {
  assert.deepEqual(
    classifyCommit({
      subject: "chore: sync roadmap artifacts",
      files: ["README.md", "docs/roadmap/roadmap.svg"],
    }),
    {
      level: "none",
      reason: "Non-release chore change with no runtime files",
    },
  );
  assert.equal(
    classifyCommit({
      subject: "docs: update deployment behavior",
      files: ["docs/operator-setup.md", "scripts/install.sh"],
    }).level,
    "patch",
  );
  assert.equal(
    classifyCommit({
      subject: "ci: automate release tags",
      files: [".github/workflows/automatic-release.yml"],
    }).level,
    "none",
  );
  assert.equal(
    classifyCommit({
      subject: "test: cover shell installer behavior",
      files: ["scripts/install.test.sh", "scripts/promote-release.test.sh"],
    }).level,
    "none",
  );
});

test("allows an explicit release footer", () => {
  assert.equal(
    classifyCommit({
      subject: "chore: prepare migration",
      body: "Release: patch",
    }).level,
    "patch",
  );
  assert.equal(
    classifyCommit({ subject: "fix: internal cleanup", body: "Release: none" })
      .level,
    "none",
  );
});

test("chooses the highest bump across commits", () => {
  assert.equal(
    determineBump([
      { subject: "fix: close a race" },
      { subject: "feat: add folders" },
      { subject: "docs: clarify setup", files: ["README.md"] },
    ]).level,
    "minor",
  );
});

test("bumps from the current release and starts at v0.1.0", () => {
  assert.equal(bumpVersion(null, "patch"), "0.1.0");
  assert.equal(bumpVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(bumpVersion("0.1.1", "minor"), "0.2.0");
  assert.equal(bumpVersion("0.2.0", "major"), "1.0.0");
  assert.equal(bumpVersion("0.2.0", "none"), null);
});

test("selects the highest valid release tag", () => {
  assert.deepEqual(latestReleaseTag(["v0.1.0", "v0.10.0", "v0.2.0"]), {
    tag: "v0.10.0",
    version: "0.10.0",
  });
});

test("keeps only annotated semantic-version release tags", () => {
  assert.deepEqual(
    parseRemoteReleaseRefs(
      [
        "aaa refs/tags/v0.1.0",
        "bbb refs/tags/v0.1.0^{}",
        "ccc refs/tags/v0.1.1",
        "ddd refs/tags/not-a-release^{}",
      ].join("\n"),
    ),
    ["v0.1.0"],
  );
});

test("produces an automated release decision", () => {
  assert.deepEqual(
    decideRelease({
      tags: ["v0.1.0"],
      commits: [
        {
          sha: "abcdef123456",
          subject: "fix: repair release check",
          files: ["scripts/release-version.mjs"],
        },
      ],
    }),
    {
      shouldRelease: true,
      level: "patch",
      reason: "Conventional Commit fix",
      previousTag: "v0.1.0",
      version: "0.1.1",
      tag: "v0.1.1",
      commits: [{ sha: "abcdef123456", subject: "fix: repair release check" }],
    },
  );
});

test("uses the fixed first-release baseline when no release tag exists", () => {
  assert.deepEqual(
    decideRelease({
      tags: [],
      commits: [
        {
          subject: "feat: start the product",
          files: ["apps/web/app/page.tsx"],
        },
      ],
    }),
    {
      shouldRelease: true,
      level: "initial",
      reason: "First release baseline",
      previousTag: null,
      version: "0.1.0",
      tag: "v0.1.0",
      commits: [{ sha: undefined, subject: "feat: start the product" }],
    },
  );
});
