# Local development upgrade, 26 October 2026

All four managed Mac workspaces are running with direct networking, as approved by the operator. This local change made no production changes. The earlier production rollout has its own [deployment record](../vps-rollout-20261026/DEPLOYED.md).

## Running configuration

- Shared Meilisearch: 1.55.0, native arm64, on loopback port 7700. The migrated volume is `marka-dev-meilisearch-v155-data`.
- Shared Browserless: 2.57.3, native arm64, token protected on loopback port 9251. Limits: 1536 MiB memory, 256 MiB shared memory, one CPU, two sessions, four queued sessions, and a 60-second provider default. Managed workers use `?timeout=0` while retaining application crawl deadlines.
- The legacy `marka-dev-chrome` container is stopped, PID zero, and port 9250 is closed. The container and old search volume remain available for rollback. Only the two shared infrastructure containers are running; unrelated containers were preserved.
- Existing crawler concurrency, connection reuse choice, on-demand connections, and screenshot-first profile were preserved.
- `CRAWLER_HTTP_PROXY` and `CRAWLER_HTTPS_PROXY` are omitted from each private local `.env`. The previous proxy returned CONNECT 403. Empty values are unsuitable because the existing crawler selector cannot select from an empty proxy list. Production proxy settings remain unchanged.

Workspace endpoints:

- `t3-778b0d57`: http://localhost:4025, worker readiness port 14025.
- `t3-936c2aac`: http://localhost:4023, worker readiness port 14023.
- `t3-edac63b8`: http://localhost:4024, worker readiness port 14024.
- `t3code-e9ae2bf5`: http://localhost:4013, worker readiness port 14013.

## Verification

The machine-readable [validation record](validation.json) reports all gates passing:

- All four web health and worker readiness endpoints returned HTTP 200. Runtime checks confirmed distinct namespaces, original data paths, direct networking, and the renderer timeout override.
- All 19 original Meilisearch namespaces, 919 documents, and their query settings survived dump migration. Four filtering queries passed. The authenticated app test also initialized its workspace's previously absent empty search index.
- Fingerprints of 12 library tables per workspace matched their pre-upgrade values after test cleanup. Bookmark counts remained 878 in each of the three T3 workspaces and 1082 in `t3code-e9ae2bf5`.
- Sixteen source renderer fixture jobs across all four workspaces passed, covering reuse and separate connections, JavaScript rendering, cookies/storage isolation, JPEG capture, and cleanup.
- One complete authenticated local API pipeline in `t3code-e9ae2bf5` saved a public page, completed its crawl, found it in search, retrieved a 60216-byte screenshot, and passed visual inspection. The temporary bookmark was deleted; API lookup returned 404 and search cleanup passed. This full API test was not repeated in the other three workspaces.
- Both new containers had zero restarts, memory-limit events, and OOM events. Browserless's measured kernel peak was 1155.6 MiB under its 1536 MiB cap. At final sampling it had no running or queued sessions. These are bounded observations rather than worst-case capacity guarantees.
- Infrastructure and launcher shell tests, syntax checks, runner formatting, and Git whitespace checks passed. No broad prune or unrelated process cleanup ran.

## Backups and change scope

Private rollback artifacts are under:

`/Users/absolutepraya/Documents/Backups/marka-local-upgrade-20261026-170353`

They include full SQLite/assets archives for all four workspaces, the original search volume archive and dump, original configuration and proxy settings, original fingerprints, migration evidence, fixture results, and validation drivers. Files are restricted to the owner. Checksums verify the original six migration/backup artifacts and the completed artifact set. Do not copy private snapshots, container inspection output, or environment files into Git.

Rollback must preserve current SQLite/assets if later writes have occurred. Rebuild derived search from current app state when returning to an older engine instead of restoring stale library data. The original search volume was not opened by Meilisearch 1.55.0.

At validation, changes to the shared launcher, infrastructure tests, renderer test endpoint, and operator/assistant docs were uncommitted in all four worktrees. This record and the canonical source changes are included in the upgrade PR; the other workspaces retain their local copies. Existing unrelated changes were preserved. The portable installer, Kubernetes, seed/E2E service defaults, and isolated Linux Compose stack were outside this local Mac rollout. The Linux stack still has its own older service pins.

The agent runner required isolated process sessions for persistent detached launchers. Worker watchers were reloaded after the final environment change and verified through live readiness checks; source files were not changed merely to trigger those reloads.
