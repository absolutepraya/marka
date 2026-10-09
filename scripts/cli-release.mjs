import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  bumpVersion,
  determineBump,
  RELEASE_LEVELS,
} from "./release-version.mjs";

export const CLI_TAG_PREFIX = "marka-cli/v";
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function fingerprint(bundle, manifest) {
  // Build with version 0.0.0 so version numbering cannot cause a new release.
  const metadata = Object.fromEntries(
    [
      "name",
      "bin",
      "type",
      "exports",
      "engines",
      "dependencies",
      "optionalDependencies",
    ].map((key) => [key, manifest[key] ?? null]),
  );
  return createHash("sha256")
    .update(bundle)
    .update(JSON.stringify(metadata))
    .digest("hex");
}

export function parseCliTag(tag, annotation, sha) {
  const version = tag.startsWith(CLI_TAG_PREFIX)
    ? tag.slice(CLI_TAG_PREFIX.length)
    : "";
  if (!VERSION.test(version)) return null;
  const data = JSON.parse(annotation);
  if (
    data.package !== "@absolutepraya/marka" ||
    !/^[a-f0-9]{64}$/.test(data.fingerprint)
  ) {
    throw new Error(`Invalid CLI release annotation: ${tag}`);
  }
  return { tag, version, fingerprint: data.fingerprint, sha };
}

export function decideCliRelease({
  previous,
  target,
  currentFingerprint,
  commits,
  covered = false,
  previousPublished = true,
}) {
  if (covered)
    return {
      shouldRelease: false,
      reason: "A newer CLI release already covers this commit",
    };
  if (previous?.sha === target) {
    if (previous.fingerprint !== currentFingerprint)
      throw new Error("Reserved release fingerprint differs from this build");
    return {
      shouldRelease: true,
      ...previous,
      reason: "Retry reserved CLI release",
    };
  }
  if (previous && !previousPublished) {
    throw new Error(
      `Unpublished reserved CLI release ${previous.tag}; retry with target ${previous.sha} before releasing another commit`,
    );
  }
  if (previous?.fingerprint === currentFingerprint) {
    return {
      shouldRelease: false,
      reason: "CLI artifact and runtime metadata unchanged",
    };
  }
  const relevant = commits.filter(({ files }) =>
    files.some(
      (file) =>
        /^(apps\/cli\/|packages\/shared\/|pnpm-lock\.yaml$|package\.json$|patches\/)/.test(
          file,
        ) &&
        !/\.(md|mdx)$|(?:^|\/)(?:[^/]+\.)?(test|spec)\.[cm]?[jt]sx?$/.test(
          file,
        ),
    ),
  );
  const bump = determineBump(relevant);
  if (relevant.length && bump.level === "none") {
    return {
      shouldRelease: false,
      reason: "Relevant commits explicitly suppress release",
    };
  }
  // A bundled change outside the scoped source paths still merits a patch.
  const level = RELEASE_LEVELS[bump.level] > 0 ? bump.level : "patch";
  const version = bumpVersion(previous?.version ?? null, level);
  return {
    shouldRelease: true,
    version,
    tag: `${CLI_TAG_PREFIX}${version}`,
    fingerprint: currentFingerprint,
    reason: previous
      ? `${level}: changed CLI artifact or runtime metadata`
      : "First Marka CLI release",
  };
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}
function ancestor(from, to) {
  try {
    git(["merge-base", "--is-ancestor", from, to]);
    return true;
  } catch {
    return false;
  }
}
function commits(range) {
  return git([
    "log",
    "--format=%x1e%H%x00%s%x00%b%x00",
    "--name-only",
    "--no-merges",
    range,
  ])
    .split("\x1e")
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body, files] = record.split("\0");
      return {
        sha,
        subject,
        body,
        files: files.trim().split("\n").filter(Boolean),
      };
    });
}

async function main() {
  const target = git(["rev-parse", "HEAD"]);
  if (!ancestor(target, "origin/main"))
    throw new Error("CLI release target is not on main");
  const refs = git([
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${CLI_TAG_PREFIX}*`,
  ]);
  const tags = refs
    .split("\n")
    .map((line) => line.split(/\s+/)[1])
    .filter((ref) => ref?.endsWith("^{}"))
    .map((ref) => ref.slice("refs/tags/".length, -3));
  const releases = tags
    .map((tag) =>
      parseCliTag(
        tag,
        git(["for-each-ref", "--format=%(contents)", `refs/tags/${tag}`]),
        git(["rev-list", "-n", "1", tag]),
      ),
    )
    .filter(Boolean)
    .filter(({ sha }) => ancestor(sha, "origin/main"));
  releases.sort((a, b) => {
    const left = a.version.split(".").map(Number),
      right = b.version.split(".").map(Number);
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
  });
  const previous = releases[0] ?? null;
  if (
    previous &&
    !ancestor(previous.sha, target) &&
    !ancestor(target, previous.sha)
  ) {
    throw new Error("CLI release history diverged from target");
  }
  let previousPublished = true;
  if (previous && previous.sha !== target && ancestor(previous.sha, target)) {
    const response = await fetch(
      `https://registry.npmjs.org/@absolutepraya%2fmarka/${previous.version}`,
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`npm registry check failed: HTTP ${response.status}`);
    previousPublished = response.ok;
    if (previousPublished) {
      const { validatePublishedVersion } =
        await import("./cli-publication.mjs");
      validatePublishedVersion(await response.json(), {
        version: previous.version,
        target: previous.sha,
      });
    }
  }
  const manifest = JSON.parse(readFileSync("apps/cli/package.json", "utf8"));
  const currentFingerprint = fingerprint(
    readFileSync("apps/cli/dist/index.mjs"),
    manifest,
  );
  const decision = decideCliRelease({
    previous,
    target,
    previousPublished,
    currentFingerprint,
    covered: Boolean(
      previous && previous.sha !== target && ancestor(target, previous.sha),
    ),
    commits: commits(
      previous && ancestor(previous.sha, target)
        ? `${previous.sha}..${target}`
        : target,
    ),
  });
  console.log(JSON.stringify({ ...decision, target }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
