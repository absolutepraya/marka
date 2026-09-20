import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFirstReleaseTag,
  assertReleaseTagIsNew,
  parseReleaseTag,
  releaseImageTags,
  releasePromotionPlan,
} from "./release-contract.mjs";

test("parses the first release tag and rejects malformed versions", () => {
  assert.deepEqual(parseReleaseTag("v0.1.0"), {
    tag: "v0.1.0",
    version: "0.1.0",
  });
  assert.throws(() => parseReleaseTag("0.01.0"));
  assert.throws(() => parseReleaseTag("0.1.0"));
  assert.throws(() => parseReleaseTag("v1.2"));
});

test("rejects duplicate release tags before release work starts", () => {
  assert.doesNotThrow(() => assertReleaseTagIsNew("v0.1.0", ["v0.0.9"]));
  assert.throws(() => assertReleaseTagIsNew("v0.1.0", ["v0.1.0"]));
});

test("requires v0.1.0 as the first remote Marka release", () => {
  assert.doesNotThrow(() => assertFirstReleaseTag("v0.1.0", []));
  assert.throws(() => assertFirstReleaseTag("v0.1.1", []));
  assert.doesNotThrow(() => assertFirstReleaseTag("v0.1.1", ["v0.1.0"]));
});

test("creates paired immutable version and commit image tags", () => {
  assert.deepEqual(
    releaseImageTags({
      releaseTag: "v1.2.3",
      commit: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    }),
    {
      version: "1.2.3",
      shortCommit: "abcdef012345",
      webVersion: "web-v1.2.3",
      workersVersion: "workers-v1.2.3",
      webSha: "web-sha-abcdef012345",
      workersSha: "workers-sha-abcdef012345",
      webStable: "web-stable",
      workersStable: "workers-stable",
    },
  );
});

test("keeps stable promotion and rollback paired by service", () => {
  const plan = releasePromotionPlan({
    imageName: "ghcr.io/absolutepraya/marka",
    releaseTag: "v0.1.0",
    commit: "abcdef0123456789abcdef0123456789abcdef01",
    previous: {
      webDigest: "sha256:web-old",
      workersDigest: "sha256:workers-old",
    },
  });

  assert.deepEqual(plan.stable, [
    {
      target: "ghcr.io/absolutepraya/marka:web-stable",
      source: "ghcr.io/absolutepraya/marka:web-v0.1.0",
    },
    {
      target: "ghcr.io/absolutepraya/marka:workers-stable",
      source: "ghcr.io/absolutepraya/marka:workers-v0.1.0",
    },
  ]);
  assert.deepEqual(plan.rollback, [
    {
      target: "ghcr.io/absolutepraya/marka:web-stable",
      source: "ghcr.io/absolutepraya/marka@sha256:web-old",
    },
    {
      target: "ghcr.io/absolutepraya/marka:workers-stable",
      source: "ghcr.io/absolutepraya/marka@sha256:workers-old",
    },
  ]);
});
