import { execFileSync } from "node:child_process";
import { parseReleaseTag } from "./release-contract.mjs";

export const RELEASE_LEVELS = Object.freeze({
  none: 0,
  patch: 1,
  minor: 2,
  major: 3,
});

const NO_RELEASE_TYPES = new Set(["ci", "docs", "style", "test", "tests"]);
const PATCH_TYPES = new Set([
  "build",
  "deps",
  "fix",
  "perf",
  "refactor",
  "revert",
  "security",
]);
const RELEASE_OVERRIDE_PATTERN = /^Release:\s*(major|minor|patch|none)\s*$/im;
const BREAKING_CHANGE_PATTERN = /^BREAKING CHANGE(?:S)?\s*:/im;
const CONVENTIONAL_COMMIT_PATTERN =
  /^([a-z][a-z0-9-]*)(?:\([^\n()]+\))?(!)?:\s+.+$/i;

const NON_RUNTIME_PATH_PATTERNS = [
  /^(?:AGENTS|CLAUDE|GEMINI|CONTRIBUTING|CONTEXT|README)\.md$/i,
  /^\.github\//,
  /^docs\//,
  /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/i,
  /(?:^|\/)(?:test|tests|__tests__)\//i,
  /(?:^|\/)[^/]*\.(?:md|mdx|txt)$/i,
];

function isNonRuntimePath(path) {
  return NON_RUNTIME_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function parseConventionalCommit(subject) {
  const match = subject.trim().match(CONVENTIONAL_COMMIT_PATTERN);
  if (!match) {
    return null;
  }

  return {
    type: match[1].toLowerCase(),
    breakingMarker: Boolean(match[2]),
  };
}

export function classifyCommit({ subject, body = "", files = [] }) {
  const override = body.match(RELEASE_OVERRIDE_PATTERN)?.[1];
  if (override) {
    return {
      level: override,
      reason: `Release footer requested ${override}`,
    };
  }

  const conventional = parseConventionalCommit(subject);
  if (conventional?.breakingMarker || BREAKING_CHANGE_PATTERN.test(body)) {
    return {
      level: "major",
      reason: "Conventional Commit breaking-change marker",
    };
  }

  if (conventional?.type === "feat") {
    return { level: "minor", reason: "Conventional Commit feat" };
  }

  if (
    conventional &&
    (NO_RELEASE_TYPES.has(conventional.type) ||
      conventional.type === "chore") &&
    files.every(isNonRuntimePath)
  ) {
    return {
      level: "none",
      reason: `Non-release ${conventional.type} change with no runtime files`,
    };
  }

  if (conventional && PATCH_TYPES.has(conventional.type)) {
    return {
      level: "patch",
      reason: `Conventional Commit ${conventional.type}`,
    };
  }

  if (
    conventional?.type &&
    (NO_RELEASE_TYPES.has(conventional.type) || conventional.type === "chore")
  ) {
    return {
      level: "patch",
      reason: `${conventional.type} commit touches runtime or deployment files`,
    };
  }

  if (files.every(isNonRuntimePath)) {
    return { level: "none", reason: "No runtime or deployment files changed" };
  }

  return {
    level: "patch",
    reason: "Runtime or deployment change without an explicit release type",
  };
}

export function determineBump(commits) {
  return commits.reduce(
    (current, commit) => {
      const classification = classifyCommit(commit);
      if (
        RELEASE_LEVELS[classification.level] > RELEASE_LEVELS[current.level]
      ) {
        return { ...classification, commit: commit.subject };
      }
      return current;
    },
    { level: "none", reason: "No release-worthy changes" },
  );
}

export function bumpVersion(currentVersion, level) {
  if (level === "none") {
    return null;
  }
  if (!currentVersion) {
    return "0.1.0";
  }

  const { version } = parseReleaseTag(`v${currentVersion}`);
  const [major, minor, patch] = version.split(".").map(Number);

  if (level === "major") {
    return `${major + 1}.0.0`;
  }
  if (level === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

export function latestReleaseTag(tags) {
  return (
    tags
      .map((tag) => {
        try {
          return { tag, version: parseReleaseTag(tag).version };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => {
        const a = left.version.split(".").map(Number);
        const b = right.version.split(".").map(Number);
        return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
      })[0] ?? null
  );
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

export function parseRemoteReleaseRefs(output) {
  return output
    .split("\n")
    .map((line) => line.split(/\s+/)[1])
    .filter((ref) => /^refs\/tags\/v\d+\.\d+\.\d+\^\{\}$/.test(ref ?? ""))
    .map((ref) => ref.slice("refs/tags/".length, -"^{}".length));
}

function remoteReleaseTags() {
  // Local clones can retain unrelated upstream v* tags. Only origin tags are
  // authoritative for Marka release numbering.
  return parseRemoteReleaseRefs(
    git(["ls-remote", "--tags", "origin", "refs/tags/v*"]),
  );
}

function isAncestor(ancestor, descendant = "HEAD") {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function collectCommits(range) {
  const raw = git([
    "log",
    "--format=%x1e%H%x00%s%x00%b%x00",
    "--name-only",
    "--no-merges",
    range,
  ]);

  return raw
    .split("\x1e")
    .filter(Boolean)
    .map((record) => {
      const shaEnd = record.indexOf("\0");
      const subjectEnd = record.indexOf("\0", shaEnd + 1);
      const bodyEnd = record.indexOf("\0", subjectEnd + 1);
      const bodyAndFiles = record.slice(bodyEnd + 1).trim();

      return {
        sha: record.slice(0, shaEnd),
        subject: record.slice(shaEnd + 1, subjectEnd),
        body: record.slice(subjectEnd + 1, bodyEnd).trim(),
        files: bodyAndFiles ? bodyAndFiles.split("\n").filter(Boolean) : [],
      };
    });
}

export function decideRelease({ tags, commits }) {
  const previous = latestReleaseTag(tags);
  const bump = determineBump(commits);
  const version = bumpVersion(previous?.version ?? null, bump.level);
  const initialRelease = previous === null && version !== null;

  return {
    shouldRelease: version !== null,
    level: initialRelease ? "initial" : bump.level,
    reason: initialRelease ? "First release baseline" : bump.reason,
    previousTag: previous?.tag ?? null,
    version,
    tag: version ? `v${version}` : null,
    commits: commits.map(({ sha, subject }) => ({ sha, subject })),
  };
}

function main() {
  const remoteTags = remoteReleaseTags();
  const laterReleaseExists = remoteTags.some(
    (tag) =>
      isAncestor("HEAD", tag) && isAncestor(tag, "refs/remotes/origin/main"),
  );
  if (laterReleaseExists) {
    console.log(
      JSON.stringify({
        shouldRelease: false,
        level: "none",
        reason: "A later release tag already covers this commit",
        previousTag: null,
        version: null,
        tag: null,
        commits: [],
      }),
    );
    return;
  }

  const tags = remoteTags.filter(
    (tag) => isAncestor(tag) && isAncestor(tag, "refs/remotes/origin/main"),
  );
  const previous = latestReleaseTag(tags);
  const range = previous ? `${previous.tag}..HEAD` : "HEAD";
  const commits = collectCommits(range);

  console.log(JSON.stringify(decideRelease({ tags, commits })));
}

if (process.argv[1]?.endsWith("release-version.mjs")) {
  main();
}
