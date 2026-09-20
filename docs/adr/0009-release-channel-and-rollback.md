# Release channel and rollback contract

Status: accepted

Issue #69 introduces an explicit shared release identity for the web and
workers product pair. It must improve operator-facing provenance without
coupling the release process to SDK, MCP, mobile, extension, or package
publication versioning.

## Decisions

### Git tags define shared releases

An annotated `vMAJOR.MINOR.PATCH` Git tag is the authoritative shared release
identity. The normalized SemVer value is release metadata; package manifest
versions remain independent metadata and are not silently bumped by a shared
release.

The tag is created automatically after a successful exact-commit CI run on
`main`. The automatic release workflow classifies commits since the latest
release tag using Conventional Commit semantics: `feat` is a minor bump,
breaking-change markers are major, release-worthy fixes and runtime changes are
patch, and documentation-only changes are ignored. A
`Release: major|minor|patch|none` footer can override the classification. The first
release is `v0.1.0`; later versions increment the highest level found in the
eligible commits. If no eligible change exists, no tag is created.

A release is built from one eligible source commit. The web and workers
artifacts from that commit receive paired immutable version tags such as
`web-v0.1.0` and `workers-v0.1.0`. Existing paired SHA tags remain valid
rollback artifacts and are retained indefinitely.

The first Marka release in this contract is `v0.1.0`. Any pre-existing local
tag with that name from unrelated upstream history is not authoritative and
must not be force-pushed as the Marka release.

### Stable is a paired mutable channel

The only supported channel in this scope is `stable`, represented by
`web-stable` and `workers-stable`. Channel references are convenience pointers,
not exact rollback identities. Production Compose and the guided Docker
installer use this channel by default.

The release process must publish and validate both immutable version artifacts
before moving either stable pointer. Because GHCR has no transaction spanning
two image repositories or tags, promotion is sequential. The process records
the previous stable pair, verifies the resulting pair's release provenance,
and restores the previous pointer if the second promotion or verification
fails. Operators can recover from a partial or unhealthy rollout by pinning
both services to one matching immutable version pair or SHA pair.

### Independent service rollout remains compatible

The existing Watchtower deployment continues to update the web and workers
services independently. Adjacent releases must therefore remain compatible
during the bounded rolling overlap, including database migration behavior.
The stable channel is considered successfully promoted only when both pointers
resolve to the intended release, but promotion does not claim an atomic
multi-container switch.

### Legacy source builds are separate

The release contract covers the current Docker production Compose and guided
Docker installer paths. The legacy source-built `marka-linux.sh` path and its
Debuntu documentation are not silently migrated by this issue; any future
alignment is a separate decision.

### GitHub Releases are derived publications

The tag-triggered workflow creates a GitHub Release only after the immutable
web and workers artifacts, stable promotion, and provenance verification have
succeeded. The GitHub Release uses the same `vMAJOR.MINOR.PATCH` tag, has a
`Marka vX.Y.Z` title, and uses GitHub-generated notes that maintainers may
edit. A committed `CHANGELOG.md` is not required by this issue.

The Git tag and source commit remain authoritative. A GitHub Release is a
human-facing explanation of that release, not a deployment pointer.

The automatic and tag-triggered workflows proceed in this order:

1. classify the commits after successful `main` CI;
2. create the next annotated release tag when a release is warranted;
3. validate the annotated tag and eligible source commit;
4. verify the exact-commit blocking CI result;
5. build and publish immutable version and SHA artifacts;
6. verify both image digests and source provenance;
7. promote and verify the stable pair;
8. create the GitHub Release.

If stable promotion partially fails, the workflow restores the previous stable
pair and fails visibly. If GitHub Release creation fails after deployment
artifacts are verified, a retry may create the missing publication without
rebuilding images or repeating stable promotion.

### Runtime metadata is additive

`/api/version` keeps the existing `version` field as a full-commit compatibility
alias and adds structured release metadata: the normalized release number,
the full source commit, and its short display form. New clients use the
structured fields. The PWA continues to compare the full commit for update
identity, while web and mobile user-facing surfaces display the release and
short commit together.

Development and legacy SHA-only builds remain valid: their release metadata
may be absent, and clients fall back to the existing development, unknown, or
commit-only behavior without treating the build as a numbered release.

The compatibility response is conceptually:

```json
{
  "version": "<full commit>",
  "release": "0.1.0",
  "commit": "<full commit>",
  "shortCommit": "abcdef0"
}
```

The PWA compares the full commit first and the legacy `version` field second;
it never uses the release number alone as its update identity. Web and mobile
surfaces display the release and short commit when available.

The admin release checker follows Marka's GitHub Releases and compares release
identity only when the running build exposes one. The active image provenance
label points to Marka; historical upstream records are not rewritten.

## Considered options

- **Use package manifest versions as the shared release source:** rejected
  because the repository contains independently versioned packages and the
  issue does not authorize changing their publication semantics.
- **Keep `main` as the production channel:** rejected because a branch name
  describes source integration, not a stable deployment contract.
- **Claim atomic stable promotion:** rejected because two independent GHCR
  tags and Watchtower service updates cannot be changed transactionally.
- **Remove the existing pull-based Watchtower rollout:** deferred because it
  would expand this issue into a coordinated deployment controller. The
  compatibility and paired rollback rules provide a bounded migration path.

## Consequences

Maintainers must validate a tagged source commit before creating its release,
publish both immutable service artifacts before channel promotion, and retain
enough metadata to prove that the two artifacts came from the same commit.
Operator documentation must distinguish a Git tag, a GitHub Release, an
immutable image tag, a mutable channel pointer, and a running deployment.

An exact rollback always changes both services together. A channel promotion
or Watchtower rollout can still expose a short compatibility window, so
release changes must preserve web and workers compatibility across that
window.
