# Native VPS experiment results, 26 October 2026

The approved temporary VPS experiment is complete and cleaned up. No production
upgrade or endpoint switch occurred. All 21 original containers retained their
IDs and start times. Marka still reports release `0.13.0`, commit `b01deb5`.

## Decision

- **Meilisearch:** production-data migration and API checks passed, with an
  observed search matching change to review before rollout. No Marka application
  code change is indicated by these tests.
- **Browserless:** native protocol, lifecycle, parsing, screenshot, and shared
  client tests passed with the `timeout=0` endpoint override. The existing 1 GiB
  renderer limit was tight under the combined workload. A larger staging limit
  passed a short follow-up, but a production memory budget remains a separate
  decision.
- **RSSHub authenticated feeds:** inconclusive. Both selected Instagram routes
  returned HTTP 503 on the existing live service and the clone, with rate-limit
  markers in both logs. Successful feed parity could not be established.
- **Watchtower:** unchanged. Its previous disposable-daemon results remain the
  evidence; this experiment did not update it or reconcile its ownership labels.

Do not describe these results as a completed production upgrade. Review the
search matching difference and rerun authenticated feed comparisons after the
existing baseline failure clears before a coordinated renderer cutover.

## Exact scope and environment

The [base Compose file](compose.yaml) selected Meilisearch 1.55.0, Browserless
2.57.3, and the existing RSSHub amd64 image by immutable digest. The VPS host
reported `x86_64`. Browserless reported Chromium `156.0.8078.4`. Search and browser
stages ran separately. Each candidate had a one-CPU limit.

The RSSHub clone used memory cache, selectively reused authentication/proxy
settings privately on the VPS, and retained access to the separate existing
real-browser helper. It never received the production Redis URL. No cron,
watcher, Discord delivery, or other posting workflow was invoked. No X-account
watches were enabled, and no X route was requested.

The default VPS Docker GHCR credentials caused a registry denial for the public
Browserless image. Pulling the exact same digest with an isolated empty Docker
configuration succeeded. The existing Docker login was not changed. A future
manual pull should account for this separately from application compatibility.

## Search dump and migration

One normal dump task was created on live Meilisearch 1.41.0. It did not change
bookmark documents or index settings. The dump was copied to a restricted new
local backup, and its SHA-256 was verified against the VPS copy before import.

- Dump UID: `20261026-020005078`
- Size: 2555938 bytes
- SHA-256: `62440cb1c184ff8f91e30941eeff56825006d13ca7e6499ee15b9572159dcf40`
- Original live dump retained at `/meili_data/dumps/20261026-020005078.dump`
  inside `karakeep-meilisearch-1`.

The isolated 1.55.0 server imported all 691 bookmark documents and the empty
vector index. Every returned document body matched the source, and all settings
fields matched on both indexes. Production contained three tenant IDs and zero
vector documents; the vector embedder was configured for 1536 dimensions.

The full bookmark document-set checksum was
`dd3298e441f400c79a19c8fc207bd84996dabfe400f083e462468155bb0e35a0`.
Raw document bodies, tenant identifiers, and private query strings were not
printed or included in the sanitized comparison report.

Twelve blank/content-derived queries were replayed against live 1.41.0 and the
isolated 1.55.0 import. Tenant filtering, blank-query date sorting, and pagination
passed. Ten query hit sets matched exactly. Two expanded on 1.55.0:

- One query returned 70 matches instead of 54, retaining all 54 old matches.
- Another returned 9 instead of 5, retaining all 5 old matches.

All settings were identical and the source index's last-update timestamp stayed
stable throughout comparison. This is an observed engine matching difference,
not evidence of lost data or a configuration mismatch. The precise matching
rule responsible was not isolated. Review relevance expectations before rollout;
do not change Marka's intended search semantics just to make versions agree.

The comparison harness was corrected to check global date ordering only for
blank queries. For content queries, the existing ranking rules can rank word
relevance ahead of the requested date sort. That initial assertion was a test
assumption error, separate from the two genuine hit-set expansions.

A separate synthetic index on the native target passed 1536-dimensional vector
search, similar-document search, ranking threshold, and tenant isolation checks.
It made no external embedding calls and was deleted afterward. The imported
production indexes were not mutated by these synthetic tests.

The search container used 169.3 MiB at the post-test sample with a 512 MiB cap.
Its cgroup recorded zero memory-limit events and zero OOM events. This sample is
not an indexing peak measurement. The candidate was stopped and removed before
the browser stage began.

## Native renderer and shared workload

Marka's existing Browserless integration suite passed in 224.41 seconds against
the VPS renderer through SSH forwarding. Its driver ran on the Mac; Chromium
ran natively on the VPS. Configuration was `CONCURRENT=2`, `QUEUED=4`,
`TIMEOUT=60000`, 256 MiB shared memory, and a 1 GiB memory limit.

The endpoint contained explicit `timeout=0`, preserving worker-owned deadlines
without sending the v1-specific negative protocol timeout. Tests covered:

- Sequential per-job connections and reused contexts at concurrency 1, 2, and 4.
- Cookie/storage isolation and intentional job/navigation failure cleanup.
- Active-session survival beyond 60 seconds, canceled-context cleanup, forced
  browser disconnect/reconnect, idle disconnect/reconnect, and shutdown.

Each of the four workload phases completed 23 of 24 jobs, with the remaining job
being the intentional simulated failure. No unexpected job failure occurred.
Sampled renderer usage peaked at 838 MiB during this lifecycle run, with zero
cgroup memory-limit or OOM events at that point.

The next test held a page open using the deployed RSSHub image's actual page
helper while Marka connected separately, rendered JavaScript, captured JPEG,
and ran its actual metadata/Readability/sanitization subprocess. Both succeeded:
RSSHub produced a 4459-byte screenshot and Marka a 108472-byte JPEG.

After the combined sequence, the renderer's kernel memory peak was exactly
1073741824 bytes, its 1 GiB cap. It recorded 16 memory-limit events and no OOM or
OOM kill. These events indicate pressure/reclaim at the limit, not failed jobs.
The cloned RSSHub peak was 328667136 bytes, below its 512 MiB limit.

A fresh staging renderer was then tested with the
[1536 MiB override](compose.memory-check.yaml). The same mixed fixture passed;
pressure sampling observed two simultaneous sessions and zero queued sessions.
The renderer's kernel peak was 968220672 bytes, about 923 MiB, with zero
memory-limit/OOM events. RSSHub's peak was 263864320 bytes.

This follow-up was a short mixed run after restart. It did not repeat the full
lifecycle history or a long-running soak at 1536 MiB, so it is not a controlled
proof that the larger cap alone eliminated all pressure. It supports evaluating
a larger shared-renderer budget; it does not authorize or establish that budget
for production. Large real sites, video pages, and additional feed traffic can
consume more memory than these fixtures.

## Instagram feed baseline failure

These exact routes were requested once from live RSSHub and once from the clone:

- `/instagram/2/user/beyondthefundamental?format=json`
- `/instagram/2/user/investart_id?format=json`

All four responses were HTTP 503. Both service logs contained `Too Many Requests`
markers. No successful item IDs were available for comparison. Error bodies and
credentials were not logged. No cookies, proxy configuration, or live service
settings were changed, and requests were stopped after these comparisons.

Candidate renderer WebSocket request counts stayed at 30 before and after both
route comparisons. The feed requests therefore did not exercise Browserless.
The native mixed fixture supplies actual browser-helper integration evidence,
but cannot establish authenticated Instagram feed parity. The existing RSSHub
container's generic health check remained healthy despite these route failures.

## Host guard, cleanup, and evidence

The resource guard collected 192 samples across both test periods. No abort
condition occurred. The lowest sampled host available memory was 1714520 KiB,
about 1.64 GiB. Swap use increased by at most 221808 KiB, about 217 MiB, relative
to the initial baseline, below the approved 256 MiB abort threshold.

Cleanup removed this exact staging project's containers, lab network, new search
volume, credential files, private imported dump copy, and staging directory.
The external `rsshub_default` network and original services were preserved.
Both SSH forwarding sessions were closed. Candidate image downloads remain
cached. The original production dump is retained as described above.

Final checks confirmed all 21 original container IDs and start times were
unchanged, all were running, and none of their configured health checks reported
unhealthy. Live search still had 691 bookmarks and zero vector documents. Marka
still reported `0.13.0` / `b01deb5`. No host upgrade, Tailscale operation, reboot,
application image publication, Watchtower change, or production cutover occurred.

The restricted local backup/evidence directory is:
`/Users/absolutepraya/Documents/Backups/marka-vps-rehearsal-20261026-085958`.
It contains the private dump with mode 0600, sanitized comparison/resource
results, guard records, fixture screenshots, controller scripts, and checksums.
Production RSSHub authentication was never copied to the Mac.

Focused unit tests passed: 19 connector/connection-manager tests. Changed
JavaScript/TypeScript files passed oxlint and oxfmt. The complete monorepo suite
was not run; application behavior and production/development/installer pins
remain unchanged. The repository changes contain test tooling and documentation.
