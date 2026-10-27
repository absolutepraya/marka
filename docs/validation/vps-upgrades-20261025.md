# VPS dependency upgrade experiment, 25 October 2026

The later approved [production rollout](vps-rollout-20261026/DEPLOYED.md) is
complete. The [native VPS experiment](vps-rehearsal-20261026/RESULTS.md) and
[follow-up](vps-rehearsal-20261026/FOLLOWUP.md) record the intervening
production-corpus, browser, capacity, and proxy checks. Instagram repair
remains separate. The local results and initial decisions below are historical
evidence from before production cutover.

This was local compatibility evidence and a proposed rollout sequence. Production
deployment, image publication, production data migration, and VPS file changes
were not performed. Tailscale and host reboots remain excluded.

## Decision

- **Meilisearch 1.55.0:** Marka's existing SDK and providers passed synthetic
  compatibility, dump/import, and rebuild tests. No application change is
  indicated. Proceed to a production-sized isolated rehearsal before deployment.
- **Browserless 2.57.3:** Marka and the deployed RSSHub browser helpers passed
  local compatibility tests with the configuration below. Deployment remains
  deferred until authenticated RSSHub routes and native VPS capacity are checked.
- **Watchtower 1.23.2:** label selection, real image updates, cleanup, and scheduled
  polling passed on a disposable daemon. Reconcile Compose ownership and review
  the exact live configuration before deployment. Keep its update separate from
  search and renderer changes.

At the end of this local experiment, no production/dev/installer pins had changed. The repository changes were
experiment probes, test-runner options, a regression assertion, and this report.

## Live baseline checked

- Local checkout, remote `main`, and both deployed application image revisions
  matched `b01deb5576d5c6a644ea20e0d681a31f34480907`. The live version endpoint
  reported release `0.13.0`. This supersedes the handoff's `d54c36e` snapshot.
- Meilisearch remained `1.41.0`; Watchtower's image label reported `1.17.2`.
  Watchtower's old image digest is
  `sha256:d70208d28ab2fb21f37ac09c58bee75160c0f88d46503f1bc0b5d92a81d35032`.
- Shared renderer: `browserless/chrome` digest
  `sha256:57d19e414d9fe4ae9d2ab12ba768c97f38d51246c5b31af55a009205c136012f`,
  Chrome `121.0.6167.85`, owned by the RSSHub Compose project.
- Renderer environment included `CONCURRENT=2`, `TIMEOUT=45000`, and
  `CONNECTION_TIMEOUT=60000`. Do not translate these conflicting names blindly;
  select and test one v2 timeout.
- Marka workers had `BROWSER_REUSE_CONNECTION=true` and `CRAWLER_NUM_WORKERS=2`.
  The normal and low-priority queues can therefore run four crawls in total.
- Watchtower still carries `/home/praya/karakeep` Compose ownership paths;
  web/workers and Meilisearch use `/home/praya/marka`.
- VPS Docker reported `29.7.2`, API `1.55`.

## Exact proposed images

The digests below identify multi-platform image manifests. Tests selected the
architectures described in the evidence sections.

- `getmeili/meilisearch:v1.55.0@sha256:ff546679970126f8822e15d1b6a06bfbff1f2ce2e43f810cfb5258012f92de5c`
- `ghcr.io/browserless/chromium:v2.57.3@sha256:40dff7c23e0e378ba451c23ef66394ffb81bd11e6b9fe8ef3066d59eb402cc5d`
- `ghcr.io/nicholas-fedor/watchtower:1.23.2@sha256:62fb91130ddb493f869cad7e198fa260dd16c5da293ed092cbd5d8781566f7a6`

Release references: [Meilisearch](https://github.com/meilisearch/meilisearch/releases/tag/v1.55.0),
[Browserless](https://github.com/browserless/browserless/releases/tag/v2.57.3),
and [Watchtower](https://github.com/nicholas-fedor/watchtower/releases/tag/v1.23.2).

## Meilisearch evidence

`scripts/experiments/meilisearch-upgrade.mts` exercises the actual
`MeiliSearchProvider` and `MeiliSearchVectorProvider`, using the installed SDK
without upgrading it. The guard requires loopback ports 17741, 17755, or 17756,
the `upgrade_fixture_` index prefix, and three-dimensional synthetic vectors.
`seed` and `mutate` deliberately change only these disposable fixture indexes.

The sequence passed:

1. Seed and query a separate 1.41.0 server.
2. Create its dump and import it into a fresh 1.55.0 data directory.
3. Query the imported data before adding any new documents.
4. Update, delete, and clear through Marka's providers.
5. Build fresh indexes on another 1.55.0 server and repeat the checks.
6. Query the untouched 1.41.0 original again after target mutations.

Checks included full text, tenant filtering, ID filtering, sorting, pagination,
Japanese/accented text, vector search, similar documents, score thresholds,
health, batched writes/deletes, direct deletes, and clearing. Target import and
rebuild tests passed on Linux arm64 and Linux amd64 under OrbStack emulation.
Each server had a 512 MiB cap.

This does not measure the production corpus, 1536-dimensional embeddings, worker
queue orchestration, or indexing time/memory at production scale. The probe uses
four documents and synthetic three-dimensional vectors.

Prefer a dump/import rehearsal into a new volume. A full-text rebuild can use
Marka's reindex operations, but recreating lost vectors requires embedding
generation and an available full-profile embedding worker, potentially with
external API costs. Preserve the old vector index instead of treating it as
cost-free disposable data. Never run the old binary against migrated files.

See the [official update guide](https://www.meilisearch.com/docs/resources/migration/updating).

## Browserless evidence and required configuration

The v2 Chromium image still runs Chromium. This replaces the old browser service
and engine version, rather than eliminating Chromium.

**Required for Marka reuse:** set the v2 worker endpoint to
`ws://browserless:3000/?timeout=0`, with the token supplied separately as today.
The hostname must match the shared private renderer network's actual alias.
Marka already preserves explicit timeout query parameters.

Without this override, Marka appends `timeout=-1`. The initial arm64 v2 experiment
reproduced a failure: Browserless 2.57.3 forwards that value as Puppeteer's
`protocolTimeout`, and Node converts the negative timer to 1 ms. The connection
fails. `timeout=0` disables the provider timer while Marka retains per-crawl
deadlines and idle disconnects. The existing v1 default is unchanged.

Relevant pinned source:
[launch options](https://github.com/browserless/browserless/blob/v2.57.3/src/browsers/index.ts),
[limiter](https://github.com/browserless/browserless/blob/v2.57.3/src/limiter.ts),
and [migration notes](https://github.com/browserless/browserless/blob/v2.57.3/MIGRATION-2.0.md).

The full existing Browserless integration suite passed against the Linux amd64
image with `TIMEOUT=60000`, `CONCURRENT=4`, `QUEUED=4`, a 1 GiB memory cap, and
256 MiB shared memory. It used 24 jobs per phase, including one intentional job
failure, at reuse concurrency 1, 2, and 4, plus a sequential non-reuse baseline.
The test also passed cookie/storage isolation, navigation-timeout recovery,
65-second active-session survival, canceled-context cleanup, forced browser
disconnect recovery, 30-second idle disconnect/reconnect, and shutdown.

Sampled renderer usage reached 1012 MiB. Cgroup `memory.events:max` increased
7164 times, with no OOM or OOM kill. These are limit-pressure events, not a count
of failed crawls. This emulated result provides no safe native VPS memory margin.

A final run through the updated repository runner also passed with
`CONCURRENT=2`, matching production's session limit. Reuse context concurrency
1, 2, and 4 and all lifecycle checks passed in 154 seconds. Sampled usage reached
945 MiB; limit-pressure events increased 1578 times, again without an OOM kill.
The non-reuse baseline was omitted from this second run. Context concurrency
within one reused browser session is distinct from the server session limit.

`scripts/experiments/browserless-content.mjs` additionally passed JavaScript
rendering, HTML extraction, a 108472-byte JPEG, and Marka's actual metadata,
Readability, and sanitization subprocess. The renderer reported Chromium
`156.0.8078.4`. This probe stops before bookmark/database/asset persistence.

The deployed RSSHub image manifest was
`diygod/rsshub@sha256:b3789602a2c3cc136d6345bdb8c7e813df430564744ffad8aebc604aea451761`,
revision `99e31ebd1f515f970ff76545ef23f0a0ae541d59`.
Both its bundled legacy browser helper and modern page helper passed title,
content, screenshot, and close checks against v2. The modern helper exercised
its existing `launch` and `stealth` URL parameters. Tests passed with arm64 and
amd64 renderers; the latter used RSSHub's amd64 child manifest
`sha256:bf72c101c07c3c1cc077eedbc75496021260536e3c9b387860d1ddbf91d7d9cd`.

These are local fixtures. Authenticated X/Instagram feeds, proxy routing,
anti-bot behavior, concurrent RSSHub plus Marka load, and native VPS memory
remain untested. Preserve the separate RSSHub real-browser helper.

The existing test runner now accepts isolated-container overrides:

```sh
MARKA_BROWSERLESS_TEST_CONTAINER=marka-upgrade-browserless \
MARKA_BROWSERLESS_TEST_SESSION_TIMEOUT_MS=0 \
mise exec -- node scripts/test-browserless-reuse.mjs --with-baseline
```

It still checks for a loopback-only Docker binding and reads the test token
privately. The default continues to use `marka-dev-browserless`.

## Watchtower evidence

Tests used a separate Docker 29.9.2 daemon inside `marka-upgrade-dind`, with its
own image store, socket, private registry, and synthetic web/worker containers.
The host socket was never mounted. The candidate Watchtower binary was arm64.

One-shot updates passed: both labeled services were recreated with new images,
their enable labels survived, unlabeled container IDs remained unchanged, old
application images were removed, and replacements were running. A second test
passed scheduled polling at a shortened two-second interval with Docker API
forced to `1.55`, matching the live VPS API version. The production 60-second
interval itself was not timed. These fixtures had no application health gate.

The harness initially built old/new images in the same daemon and lost the old
tag reference. Preserving the old local reference until Watchtower pulled the
remote update fixed that fixture error. Another polling attempt inspected a
container during recreation and was canceled; disposable fixtures were restored
and the test rerun with transient missing containers handled. These failures
are preserved in the experiment artifacts.

A completed scan and running replacements do not establish atomic paired
deployment or Marka migration compatibility. Do not interrupt an update in
progress when pausing Watchtower; confirm both app services are healthy first.

## Proposed production sequence, requires separate approval

1. Review a sanitized diff of live Compose configuration and ownership. Create
   consistent recovery artifacts for SQLite/assets and the old Meilisearch
   volume before any production migration. Retain exact old image digests.
2. Rehearse the production Meilisearch dump/import in an isolated native Linux
   instance, including actual index counts, filters, vector dimensions, memory,
   and worker synchronization. Update production, dev, installer, and other
   maintained pins together only after that gate passes.
3. Stage Browserless privately alongside v1. Test authenticated RSSHub feeds and
   Marka crawls, proxy handling, queue contention, timeouts, and combined memory
   at the existing two-session limit. Do not increase concurrency during the
   version migration. Keep its token private and expose no public renderer port.
4. During the approved cutover window, coordinate both consumers, set Marka's
   v2 endpoint override, and switch the shared renderer only after the gates
   pass. Fall back to the preserved v1 service and its original consumer config
   if verification fails. Preserve unrelated RSSHub real-browser configuration.
5. Upgrade/recreate Watchtower separately from the canonical Compose path with
   the pinned image. Verify label selection, app health, registry polling, and
   the corrected ownership labels. No stable app image publication is required
   for the compatibility configuration above.

## Local artifacts

Restricted experiment directory:
`/Users/absolutepraya/Documents/Backups/marka-vps-upgrade-experiment-20261025-204103`.
It contains synthetic old/new Meilisearch databases, a dump, sanitized test
output, renderer screenshot, and Watchtower fixture scripts/logs. Its `test.env`
contains generated local test credentials with mode 0600. No production data or
credentials were copied into these artifacts, and no production backup was
created because production was not changed.

Disposable containers, their private network, and the nested daemon's anonymous
storage were removed after testing. Existing shared local services remained
running. Downloaded candidate images remain cached for further experiments.

The original October 22 handoff remains historical. This report supplies its
updated deployment snapshot, exact candidates, tests, and remaining gates.

Focused connector/connection-manager unit tests passed: 19 tests. Changed
JavaScript/TypeScript files passed oxlint and oxfmt, and `git diff --check` passed.
The complete monorepo suite was not run; production application behavior and
dependency pins were not modified.
