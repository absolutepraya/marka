export const RELEASE_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export interface ServerVersionInput {
  legacyVersion?: string | null;
  release?: string | null;
  commit?: string | null;
}

export interface ServerVersionResponse {
  version: string;
  release: string | null;
  commit: string | null;
  shortCommit: string | null;
}

export function normalizeReleaseVersion(value?: string | null): string | null {
  const release = value?.trim();

  if (!release) {
    return null;
  }

  const normalized = release.startsWith("v") ? release.slice(1) : release;

  return RELEASE_VERSION_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeCommitSha(value?: unknown): string | null {
  const commit = typeof value === "string" ? value.trim() : null;

  return commit && COMMIT_SHA_PATTERN.test(commit)
    ? commit.toLowerCase()
    : null;
}

export function createServerVersionResponse({
  legacyVersion,
  release,
  commit,
}: ServerVersionInput): ServerVersionResponse {
  const normalizedLegacyVersion = legacyVersion?.trim() || null;
  const normalizedCommit =
    normalizeCommitSha(commit) ?? normalizeCommitSha(normalizedLegacyVersion);

  return {
    version: normalizedCommit ?? normalizedLegacyVersion ?? "unknown",
    release: normalizeReleaseVersion(release),
    commit: normalizedCommit,
    shortCommit: normalizedCommit?.slice(0, 7) ?? null,
  };
}

export function formatServerVersionDisplay(
  version: ServerVersionResponse,
): string {
  if (version.release && version.shortCommit) {
    return `${version.release} · ${version.shortCommit}`;
  }

  return version.shortCommit ?? version.commit ?? version.version;
}
