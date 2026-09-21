import { fileURLToPath } from "node:url";

export const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
export const FIRST_RELEASE_TAG = "v0.1.0";

export function parseReleaseTag(tag) {
  if (typeof tag !== "string" || !RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(
      `Release tag must match vMAJOR.MINOR.PATCH with no leading zeroes: ${tag}`,
    );
  }

  return {
    tag,
    version: tag.slice(1),
  };
}

export function assertReleaseTagIsNew(tag, existingTags) {
  parseReleaseTag(tag);
  if (existingTags.includes(tag)) {
    throw new Error(`Release tag already exists: ${tag}`);
  }
}

export function assertFirstReleaseTag(tag, existingReleaseTags) {
  parseReleaseTag(tag);
  if (existingReleaseTags.length === 0 && tag !== FIRST_RELEASE_TAG) {
    throw new Error(
      `The first Marka release must be ${FIRST_RELEASE_TAG}, received ${tag}`,
    );
  }
}

export function releaseImageTags({ releaseTag, commit }) {
  const { version } = parseReleaseTag(releaseTag);
  if (typeof commit !== "string" || !COMMIT_SHA_PATTERN.test(commit)) {
    throw new Error(
      `Release commit must be a 7 to 40 character SHA: ${commit}`,
    );
  }

  const shortCommit = commit.slice(0, 12).toLowerCase();
  return {
    version,
    shortCommit,
    webVersion: `web-v${version}`,
    workersVersion: `workers-v${version}`,
    webSha: `web-sha-${shortCommit}`,
    workersSha: `workers-sha-${shortCommit}`,
    webStable: "web-stable",
    workersStable: "workers-stable",
  };
}

export function releasePromotionPlan({
  imageName,
  releaseTag,
  commit,
  previous,
}) {
  const tags = releaseImageTags({ releaseTag, commit });
  const rollback = previous
    ? [
        {
          target: `${imageName}:${tags.webStable}`,
          source: `${imageName}@${previous.webDigest}`,
        },
        {
          target: `${imageName}:${tags.workersStable}`,
          source: `${imageName}@${previous.workersDigest}`,
        },
      ]
    : [];

  return {
    immutable: [
      `${imageName}:${tags.webVersion}`,
      `${imageName}:${tags.workersVersion}`,
      `${imageName}:${tags.webSha}`,
      `${imageName}:${tags.workersSha}`,
    ],
    stable: [
      {
        target: `${imageName}:${tags.webStable}`,
        source: `${imageName}:${tags.webVersion}`,
      },
      {
        target: `${imageName}:${tags.workersStable}`,
        source: `${imageName}:${tags.workersVersion}`,
      },
    ],
    rollback,
  };
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const [command, value] = process.argv.slice(2);

  try {
    if (command !== "validate-tag" || !value) {
      throw new Error(
        "Usage: node scripts/release-contract.mjs validate-tag vMAJOR.MINOR.PATCH",
      );
    }

    console.log(JSON.stringify(parseReleaseTag(value)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
