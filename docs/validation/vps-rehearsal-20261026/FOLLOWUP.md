# Upgrade follow-up, 26 October 2026

The subsequent approved [production rollout](../vps-rollout-20261026/DEPLOYED.md)
is complete. The experiment-only boundary below describes this earlier stage.

This follow-up records the user's decisions after the initial native rehearsal.
It supplements the historical [results](RESULTS.md). Production cutover remains
outside the approved experiment scope.

## Accepted decisions

- Preserve Marka's current typo-tolerant search settings for the upgrade.
- Track Instagram repair separately; recovery of the already-failing Instagram
  feeds is not a prerequisite for these dependency upgrades.
- Evaluate a 1536 MiB renderer cap with two sessions, without changing crawler
  concurrency. The longer native mixed workload and browser-dependent RSSHub
  route checks are recorded below.

## Search finding clarified

The earlier comparison observed broader matches on a fresh 1.55 import than on
the live 1.41 index. A follow-up imported the same verified production dump into
fresh, isolated local instances of **both 1.41.0 and 1.55.0**. All twelve replayed
queries returned identical ordered hit sets between those rebuilt instances.

The two affected queries returned 70 and 9 hits on both rebuilt versions, versus
54 and 5 on the live index. Live document bodies still matched the dump, and the
live index stayed stable during comparison. No original hits were lost, and
their relative order was retained. One query's first ten hits were unchanged;
the other gained a fuzzy match at rank two.

Match-position and ranking diagnostics identified one-character deletion and
two-character substitution matches. These fit the existing typo-tolerance
settings. This isolates the observed difference to live-versus-rebuilt index
state in these tests; it does not establish the historical cause of that state.
Do not describe the difference as a proven 1.55-only search-semantic change.

No live reindex or settings change occurred. Both temporary local containers,
their imported databases, and generated credentials were removed. Only
sanitized follow-up evidence was retained.

## Instagram remains a separate investigation

The deployed `/instagram/2/:category/:key` web-API route uses HTTP and explicitly
declares that it does not require Puppeteer. Its bundled handler references the
Instagram cookie but not the Instagram proxy setting. The legacy private-API
handler references that proxy setting. The running RSSHub container had
`IG_COOKIE` and `IG_PROXY` configured, with no global proxy variables present.

Recent service logs contained rate-limit markers. These observations identify
a likely proxy-path gap to investigate, not a proven cause of Instagram's
failure. Cookie validity, actual upstream egress, and recovery remain unproven.
No cookie, proxy, Hermes watcher, or production RSSHub setting was changed.

The first repair step should verify the web route's actual egress and proxy
handling in isolation. Do not assume replacing Browserless will repair this
HTTP route, and do not change the shared global proxy without reviewing its
effect on other feeds.

## Extended renderer experiment

Execution and cleanup are complete. The experiment used the previously tested
immutable Browserless 2.57.3 and deployed RSSHub image digests, a 1536 MiB renderer cap,
256 MiB shared memory, two sessions, four queued sessions, and one CPU per
candidate. Both clients used an explicit `timeout=0` endpoint override. The
exact staging configuration is [compose.soak.yaml](compose.soak.yaml).

The new temporary project is `marka-renderer-soak-20261026-1400`. Published ports
bind to loopback. RSSHub has a 512 MiB cap and its own memory cache, and receives
only a generated staging renderer endpoint. It receives no production cookies,
proxy credentials, Redis URL, data volumes, or real-browser helper connection.

The workload repeats the existing full lifecycle suite, then ten minutes of
mixed synthetic rendering through Marka's real connection manager and RSSHub's
deployed page helper. Separate requests compare browser-dependent routes
against the live and candidate RSSHub instances. Session logs establish whether
the candidate route actually used the renderer.

The existing lifecycle suite passed in 208.58 seconds, with the sequential
baseline and reuse at concurrency 1, 2, and 4. Each phase completed 23 of 24
jobs; the remaining job was the intentional failure. Long-session survival,
cancellation, forced reconnect, idle reconnect, and shutdown passed. The
highest sampled renderer usage was 564 MiB; cgroup memory-limit and OOM counters
remained zero through that suite.

The actual `/ccac/news/all?format=json&limit=1` route returned HTTP 200 with one
item on both live and candidate RSSHub. Both item-ID checksums were
`4152e3c4cad3673344ab06bbb2961a3dc0eb1a011bff269b942de81da7435da3`.
The candidate renderer logged the upstream CCAC news page request. Its distinct
session count increased from 46 to 47. This supplies a successful public
browser-dependent route check; it is not evidence of Instagram recovery.

Two preceding routes, Parliament research briefings and UESTC automation
notices, returned HTTP 503 with empty-feed errors on both instances. Parliament
encountered a Cloudflare challenge. These failures do not establish a candidate
regression. A direct read-only HITCON page preflight returned HTTP 403; its
RSSHub route was not requested.

The first route counter looked only for an old log message in stdout and
incorrectly reported zero browser requests. It was replaced with distinct
session IDs from both log streams and an upstream-target trace check. Do not
use the initial zero counter as evidence that Parliament bypassed the browser.

### Mixed workload and capacity

Marka completed **192 jobs in 601.414 seconds** through its actual
`BrowserConnectionManager`. It used one browser connection and 191 reused
leases. Each job created an isolated context, checked empty cookies and local
storage, executed fixture JavaScript, rendered a canvas/article, captured JPEG,
and closed its context. There were no job or connection-cleanup failures.

The three approximately 200-second phases used concurrency 1, 2, and 4, with
34, 31, and 24 batches respectively. These are simultaneous contexts on Marka's
single reused browser connection, not separate Browserless sessions. The
concurrency-4 phase represents the potential combined normal and low-priority
crawler workload; it does not change production crawler concurrency.

The deployed RSSHub page helper completed **46 renders in 610.524 seconds** in a
separate process in the staging RSSHub container. It repeatedly opened a browser
session, checked JavaScript and the fixture title, captured PNG, and destroyed
its page/session. Its screenshots totaled 234692 bytes. The successful CCAC
route request also ran during the mixed workload.

Across the lifecycle, route probes, and mixed workload, the renderer's kernel
memory peak was **937123840 bytes, about 894 MiB**, under the 1536 MiB cap.
RSSHub's peak was **313401344 bytes, about 299 MiB**, under its 512 MiB cap.
Both candidates recorded zero memory-limit events, OOM events, OOM kills, and
restarts. Pressure sampling observed a maximum of two running sessions and one
queued session, with no recent rejections. At the final check, running and
queued sessions were both zero.

The guard collected 196 samples over 1063.8 seconds. It did not abort. Its
lowest available-memory sample was 1586688 KiB, about 1.51 GiB; a separate
manual status sample briefly showed about 1.41 GiB available. The guard's
largest swap increase was 120048 KiB, about 117 MiB, below its 256 MiB threshold.

These results support a **1536 MiB shared-renderer starting budget with two
sessions and unchanged crawler concurrency** for a reviewed rollout. This is a
bounded fixture workload plus one successful public feed route, not a full
production traffic replay, a proxy-enabled crawl test, or a worst-case site
memory bound. The earlier 1 GiB and current 1.5 GiB runs had different workload
histories, so they are not a controlled measurement of the cap change alone.

The host guard records original container identities and start times, health,
available memory, swap, candidate cgroup events, and renderer pressure. Its
existing abort thresholds remain 512 MiB host available memory, an increase of
more than 256 MiB swap, a candidate OOM kill, or an original service change.
Only staging resources could be stopped by the guard.

## Cleanup, evidence, and rollout boundary

The two staging containers, their private network, generated credential files,
and staging directory were removed. The SSH forwarding session was closed.
No production data volume was mounted into a candidate. All 21 original
containers retained their IDs and start times, remained running, and had no
unhealthy configured health checks. Marka still reported `0.13.0` / `b01deb5`.

Restricted evidence is retained at:
`/Users/absolutepraya/Documents/Backups/marka-renderer-soak-20261026-140107`.
It contains the exact staging Compose file, public experiment drivers,
sanitized lifecycle and route results, mixed-workload output, cgroup/host guard
samples, redacted staging logs, final cleanup verification, and checksums. No
production credential or raw private search document was copied into it.

No production endpoint, image pin, Compose file, search setting, watcher, or
application release was changed. The current development and installer defaults
also remain unchanged. Watchtower's earlier disposable-daemon verification
remains its compatibility evidence; this follow-up did not repeat or apply
that upgrade.

The [configuration proposal](../vps-rollout-20261026/PLAN.md) now contains the
exact live-file patches, ordered migration, validation gates, and rollback.
Later [validation](../vps-rollout-20261026/VALIDATION.md) also passed finite
RSSHub deadlines and native authenticated crawler proxy probes. The proposal
keeps `timeout=0` only for Marka's reused connection; RSSHub keeps its existing
endpoint and a finite provider default. This extended soak's both-client
override is historical test configuration, not the final proposed setting.

Review is still required before production writes, as the user requested
experiment-only work before cutover. Keep Instagram repair separate and
preserve unrelated RSSHub real-browser configuration. The later validation
also records the independently updated 0.14.0 application baseline; the
0.13.0 cleanup observation above belongs to the earlier soak.
