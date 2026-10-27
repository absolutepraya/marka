# Rollout proposal validation, 26 October 2026

The later approved production outcome is recorded in [DEPLOYED.md](DEPLOYED.md).
The checks below describe the pre-cutover validation.

The [rollout plan](PLAN.md) is ready for review. These checks did not apply
production configuration, migrate production search, or change dependency
versions. The earlier [native rehearsal](../vps-rehearsal-20261026/RESULTS.md)
and [extended workload](../vps-rehearsal-20261026/FOLLOWUP.md) remain historical
evidence, with the additional checks below.

## Finite RSSHub deadlines

A disposable native VPS candidate used the proposed Browserless 2.57.3 digest,
1536 MiB memory, 256 MiB shared memory, one CPU, two sessions, four queued
sessions, and a 60-second default. RSSHub used its deployed image digest and
its existing endpoint shape, with no timeout override. Both deployed helper
paths executed JavaScript, checked titles, and captured screenshots.

Both RSSHub helpers impose their own 30-second browser-close timer. An initial
test incorrectly expected the helper connection to survive to the provider's
60-second deadline. The corrected test separated helper and direct clients:
helper disconnect occurred after 27797 ms and direct-provider disconnect after
58576 ms, measured after launch/setup. Both expected deadlines passed.

The actual `/ccac/news/all?format=json&limit=1` route returned HTTP 200 from
live RSSHub and the candidate, in 2.31 and 5.12 seconds respectively. Both
returned one item with the same ID checksum:
`4152e3c4cad3673344ab06bbb2961a3dc0eb1a011bff269b942de81da7435da3`.
The candidate gained one renderer session and logged the upstream target URL.

Renderer peak memory was 961531904 bytes, about 917 MiB; RSSHub peaked at
316813312 bytes, about 302 MiB. Neither candidate had memory-limit events,
OOMs, OOM kills, or restarts. The host guard collected 64 samples, reached a
minimum of 2140612 KiB available memory, and observed at most 29056 KiB of
additional swap. It did not abort.

## Existing authenticated crawler proxies

A second disposable candidate was probed from the existing deployed Marka
worker container using its installed Playwright 1.59.1. The test used the
existing HTTP and HTTPS crawler proxy credentials only inside VPS processes.
Proxy authentication was passed separately from the proxy server URL.

All four probes passed: HTTP and HTTPS through the old renderer and through
the candidate. Each returned HTTP 200, the expected Example Domain title,
and a JPEG screenshot. Baseline screenshots were 57441 bytes and candidate
screenshots were 56543 bytes. The candidate used Marka's `timeout=0` override;
the baseline used its existing effective connection settings.

Candidate diagnostic logging was disabled for this probe. A VPS-local check
found no configured proxy URI or password in candidate logs. No production
credential was exported into the retained test drivers or result files.

Renderer peak memory was 670420992 bytes and RSSHub peaked at 238469120 bytes.
There were no memory-limit events, OOMs, OOM kills, or restarts. The 47-sample
guard did not abort; its minimum available memory was 2259776 KiB and maximum
additional swap was 12336 KiB. These public-page probes establish proxy
compatibility, not coverage of every production crawl destination.

## Configuration and recovery checks

[validation.json](validation.json) records successful application and reversal
of all three patches in isolated local fixtures. Docker Compose accepted the
proposed Marka, RSSHub, and importer configurations using dummy credentials.
The final configuration preserves `karakeep_data`, uses an explicitly selected
external search volume, never mounts the old search database in the importer,
requires an existing read-only dump file, and publishes no renderer host port.
Omitting the target-volume variable fails configuration validation. RSSHub's
endpoint, Redis, real-browser helper, and renderer network are preserved.

The existing CLI authentication was checked against production without
printing identity or credentials. Admin job-statistics access passed.
[recovery-access.json](recovery-access.json) records a separate strictly
read-only SQLite metadata check confirming the configured key's admin role
and required reindex scope. No reindex or bookmark mutation was invoked.
This proves current authorization metadata, not successful future recovery.

## Refreshed baseline and cleanup

The application independently advanced from the rehearsal's `b01deb5` to
0.14.0 / `56e4aba47e2a10642f96c41e2ea42cb4d5583545`. The source comparison
contained web/list changes, with no change to worker code, search providers,
database schema, dependency manifests, or lockfile. The proposal preserves
the current application revision and requires another drift check at execution.

Both candidate projects and their temporary resources were removed. Each
cleanup verified that all 21 original production containers retained their
IDs and start times, remained running, and had no unhealthy configured health
checks. No candidate mounted production data. Final inspection found no
remaining renderer candidates and exactly the original three members on
`karakeep-renderer`: Marka workers, RSSHub, and production Browserless.
Both live Compose hashes still matched the recorded preconditions.

The public inventory count excludes the two temporary candidates that were
present during proposal preparation. A fresh baseline is required at rollout.

Restricted evidence and checksums are retained in:

- `/Users/absolutepraya/Documents/Backups/marka-renderer-deadline-20261026-144349`
- `/Users/absolutepraya/Documents/Backups/marka-renderer-proxy-20261026-145629`

These tests support the proposed personal VPS cutover. Production capture,
persisted assets, visible previews, post-cutover search, live updater polling,
and rollback execution remain rollout checks. No repository runtime defaults
have been updated, and Instagram repair remains separate.
