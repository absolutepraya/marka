import { describe, expect, it } from "vitest";

import {
  createServerVersionResponse,
  formatServerVersionDisplay,
  normalizeReleaseVersion,
} from "./version";

describe("server version metadata", () => {
  it("normalizes release tags without accepting malformed versions", () => {
    expect(normalizeReleaseVersion("v0.1.0")).toBe("0.1.0");
    expect(normalizeReleaseVersion("0.1.0")).toBe("0.1.0");
    expect(normalizeReleaseVersion("v01.2.3")).toBeNull();
    expect(normalizeReleaseVersion("nightly")).toBeNull();
  });

  it("prefers the explicit full commit and derives the short commit", () => {
    expect(
      createServerVersionResponse({
        legacyVersion: "development",
        release: "v0.1.0",
        commit: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      }),
    ).toEqual({
      version: "abcdef0123456789abcdef0123456789abcdef01",
      release: "0.1.0",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
      shortCommit: "abcdef0",
    });
  });

  it("uses the legacy commit field when the new commit field is absent", () => {
    const version = createServerVersionResponse({
      legacyVersion: "abcdef0123456789abcdef0123456789abcdef01",
    });

    expect(version.commit).toBe("abcdef0123456789abcdef0123456789abcdef01");
    expect(version.shortCommit).toBe("abcdef0");
    expect(formatServerVersionDisplay(version)).toBe("abcdef0");
  });

  it("preserves development fallbacks without inventing release metadata", () => {
    const version = createServerVersionResponse({
      legacyVersion: "development",
      release: "not-a-release",
    });

    expect(version).toEqual({
      version: "development",
      release: null,
      commit: null,
      shortCommit: null,
    });
    expect(formatServerVersionDisplay(version)).toBe("development");
  });
});
