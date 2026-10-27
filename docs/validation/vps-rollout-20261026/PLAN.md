# Proposed personal VPS rollout, 26 October 2026

Status: approved by the user and executed. See the [deployment record](DEPLOYED.md)
for the outcome. The original reviewed proposal below is retained as history.

This is a reviewable configuration proposal, not a record of deployment.
Production configuration, data volumes, and dependency versions have not been
changed. The [validation report](VALIDATION.md) links the compatibility,
capacity, proxy, deadline, and configuration evidence. Applying this proposal requires approval
for the live-file diff and maintenance window, following the user's request
to experiment before production cutover.

## Exact proposed changes

| Artifact | Live target | Change |
| --- | --- | --- |
| [marka.patch](marka.patch) | `/home/praya/marka/docker-compose.yml`, mirrored by `deploy/docker-compose.prod.yml` | Pin Meilisearch 1.55; select an explicitly imported external volume; add Marka's `timeout=0` endpoint override. |
| [marka.env.additions](marka.env.additions) | `/home/praya/marka/.env` | Append the new search volume name, preserving every existing entry. |
| [rsshub.patch](rsshub.patch) | `/home/praya/rsshub/docker-compose.yml` | Pin Browserless 2.57.3; use 1536 MiB, 256 MiB shared memory, one CPU, two sessions, four queued sessions, and a 60-second default; pin RSSHub to its already-running image digest. |
| [watchtower.patch](watchtower.patch) | `/home/praya/marka/docker-compose.yml`, mirrored by `deploy/docker-compose.prod.yml` | Separately pin Watchtower 1.23.2 and recreate it from the canonical directory. |
| [compose.import.yaml](compose.import.yaml) | New temporary migration directory | Import a fresh dump into the new volume without mounting the old database. |

The Marka patches use repository paths. Apply their equivalent hunks to the
verified live Marka Compose file rather than copying an unreviewed file over
it. The RSSHub patch path is relative to `/home/praya`. All patches are free of
credential values. The two public Compose baseline hashes are recorded in
[preconditions.json](preconditions.json). The canonical local Marka Compose file
was byte-identical to the live file when this proposal was prepared.

Marka keeps its current reuse and crawler concurrency settings. Its reused
connection needs `timeout=0`; worker-owned crawl deadlines remain in force.
RSSHub's endpoint and token reference remain unchanged. Its deployed helpers
have their own 30-second close timer, and the renderer retains a finite
60-second default for clients without an override. No credentials are rotated
or copied into source, and the real-browser helper, Redis, network names,
existing access bindings, and Instagram configuration are preserved.

## Refreshed live baseline

The live app advanced independently after the earlier rehearsal. Web and workers
now both report **0.14.0 / `56e4aba47e2a10642f96c41e2ea42cb4d5583545`**. The
comparison with the tested `b01deb5` revision contains web/list changes; worker
code, search providers, database schema, dependency manifests, and lockfile are
unchanged. This proposal does not revert or release the application.

The current volumes are `karakeep_data`, about 348 MiB, and
`karakeep_meilisearch`, about 117 MiB. Only web/workers mount the app volume;
only the current Meilisearch container mounts the search volume. Search still
contains 691 bookmark documents and zero vector documents and was not indexing.
Capture fresh values immediately before execution, rather than treating these
counts as permanent.

The proposed target `karakeep_meilisearch_v155_20261026` does not exist at this
preflight. The new volume is external in both importer and final Compose so a
missing volume cannot silently become an empty production index. The old
`karakeep_meilisearch` volume is retained, unmounted by the new server.

Only `karakeep-web-1` and `karakeep-workers-1` have Watchtower's enable label.
Watchtower still has ownership labels pointing at `/home/praya/karakeep`.
Recreating that service from `/home/praya/marka` corrects ownership without
manually editing labels or recreating unrelated services.

The existing authenticated CLI can read admin job statistics. A separate
read-only metadata check confirmed that its key belongs to an admin and grants
`admin:bookmarks:readwrite` directly or through full access. No reindex was
invoked. Repeat this recovery-access check immediately before execution.

## Availability and scope

Reserve a maintenance window for stopping Marka web/workers, consistent
snapshots, search import, and renderer replacement. Marka will be unavailable
while its web service is stopped. RSSHub will be stopped briefly while its
shared renderer is replaced. Redis and the separate real-browser service stay
running. A 10-to-15-minute window is a planning budget, not measured downtime.
Slow queue shutdown, transfer, or validation must trigger rollback rather than
an unreviewed extension or skipped check.

There is no nginx, DNS, firewall, TLS, Tailscale, host package, reboot, watcher,
Instagram, application-release, or npm operation in this proposal. Only the six
named application/dependency containers may be intentionally stopped or
recreated. Capture and preserve the identities and start times of every other
container before and after the window.

These patches prepare the existing personal VPS. They do not claim that
development, installer, Kubernetes, seed, or E2E default pins have already been
updated. Those maintained source defaults need their own coordinated source
change and focused shell/configuration checks before claiming full repository
alignment. The portable installer's managed Chrome is a separate renderer
choice and must not be silently replaced by this personal shared-renderer plan.

## Ordered execution after approval

1. Re-read all live file hashes, effective endpoints, token-equality booleans,
   volumes, current app image IDs/digests, readiness, and unrelated containers.
   Abort on unexplained drift from the reviewed diff. Confirm the new volume
   is absent and the only app/search writers are the expected services.
   Verify an existing admin CLI session can read job statistics and verify its
   admin role and reindex scope through read-only metadata, without triggering
   a reindex. This preserves the recovery path if rollback later needs it. No
   token goes in a command-line argument or transcript.

2. Pre-pull the three tested immutable dependency references and the already
   running RSSHub digest. Preserve the old image references listed below.
   Account for the previously observed public-GHCR login issue by using an
   isolated empty Docker client configuration for public pulls if necessary;
   do not replace the existing registry login. Confirm at least 2 GiB available
   memory and sufficient disk. Verify a proxy-backed browser probe against the
   existing renderer and a private candidate before stopping services. Keep
   credentials and any diagnostic redaction on the VPS. A candidate-only failure
   blocks cutover; a baseline failure requires a separate diagnosis.

3. Pause Watchtower only after web and workers are healthy and no update is in
   progress. Preserve the exact current application image IDs. Use
   `--pull never` on controlled `up` operations and recheck that local stable
   tags still resolve to those captured image IDs before recreating consumers.
   Abort on a new app image rather than mixing an application release into this
   dependency window.

4. Gracefully stop Marka workers and web. Do not force-kill or take a snapshot
   from an unexplained incomplete shutdown. Once writers are stopped, preserve
   the complete app volume, including SQLite files, WAL files, queue state,
   assets, and local backups. Wait for live Meilisearch tasks to drain and record
   frozen documents/settings/checksums, then create a new normal Meilisearch
   dump. Stop the old Meilisearch service and archive its complete original
   volume through a read-only mount. Export recovery artifacts and hashes to a
   new mode-0700 Mac directory under
   `/Users/absolutepraya/Documents/Backups/marka-vps-rollout-yyyymmdd-hhmmss`;
   files containing data or credentials must be mode 0600. Include exact Compose
   files and credential files in a restricted configuration archive. Do not
   print their contents. Verify hashes and archive readability before proceeding.
   No existing backup is overwritten.

5. Create only `karakeep_meilisearch_v155_20261026`. In a new mode-0700 VPS
   migration directory, place the verified fresh dump, the importer Compose
   file, and a mode-0600 `.import.env` containing only the existing Meilisearch
   key. The key stays VPS-local except within the explicitly approved restricted
   configuration backup. Set the importer's two path/volume variables and start
   it with no host port. Import into the new external volume. Compare frozen
   document bodies, settings, counts, tenant filtering, date sorting, pagination,
   and representative query results with the source snapshot. Preserve current
   search settings. Do not regenerate embeddings.

6. Stop/remove the importer container before attaching the final Meilisearch
   service. Verify there is no active writer on the new volume. Append the exact
   volume setting and apply `marka.patch`. Validate Compose privately, without
   printing resolved configuration. Start only Meilisearch with `--no-deps`
   and `--pull never`. Check API readiness and repeat the imported-state checks
   before either application producer resumes.

7. Stop only the RSSHub app and old Browserless service. Apply `rsshub.patch`,
   validate Compose privately, and start only Browserless with `--no-deps`
   and `--pull never`. Verify its image, memory/CPU/shared-memory limits,
   authenticated health check, networks, absence of a host port, and effective
   two-session limit. Start only RSSHub from its preserved image digest. Check
   health and the browser-dependent CCAC route, including its renderer trace.
   Keep the previous separate real-browser helper and Redis untouched.

8. Start web from its captured existing image, wait for health, then start
   workers from their captured existing image. Probe worker `/ready` on its
   actual listening port; `WORKERS_PORT` currently defaults to an automatic
   port, so discover it from startup logs or container listening sockets when
   logging is suppressed, instead of assuming a fixed one. Verify
   the preserved app revision, expected database/assets, search filtering, and
   queue progress. Save one uniquely identified public test bookmark under the
   existing owner account, verify its capture, stored asset, search result, and
   visible preview, then remove only that newly created test record and verify
   its search cleanup. This is the proposed functional verification scope, not
   permission to delete existing library data.

9. Monitor the actual renderer and both crawler queues at unchanged concurrency.
   Record cgroup peaks/events, jobs, ready state, running/queued sessions, and
   host memory/swap. Stop promotion on OOM, persistent unexpected job failures,
   an unrelated unhealthy service, less than 512 MiB available host memory,
   or more than 256 MiB swap growth from the window baseline. Keep the updater
   paused until these gates pass or rollback completes.

10. Apply `watchtower.patch` as a separate final step. Recreate only Watchtower
    from `/home/praya/marka`, with project `karakeep`, and verify its new digest,
    corrected Compose ownership paths, enable-label selection of exactly
    web/workers, socket mount, health, and a scheduled registry scan. A healthy
    endpoint alone does not prove correct selection or polling. If this isolated
    upgrade fails, restore the old Watchtower digest without reverting the
    successfully verified search/renderer migration. Resume ordinary polling
    only after checking application health again.

11. Verify every unrelated container retained its ID/start time. Export final
    evidence and checksums. Remove only importer/probe containers, their private
    networks, temporary dump copies, and temporary credential files. Retain both
    search volumes and the original image references for rollback; do not run
    volume removal, image prune, or broad Compose teardown.

## Rollback

Before the app resumes, both producers are stopped and the old search volume
has received no new writes. On a search or renderer gate failure, stop only the
new dependency services, restore both exact original Compose files and the
original volume selection, then recreate the old renderer/search from their
retained digests. Restore the old effective Marka endpoint together with the v1
renderer. Start the preserved application images, verify health/readiness,
and resume the old updater only after recovery is verified. Retain the candidate
volume for diagnosis; do not ask 1.41 to open the 1.55 volume.

After application writes resume, the old search snapshot can be stale. **Do not
restore the old app-volume backup merely to roll back infrastructure**; SQLite
and assets remain the current source of truth. Restore the old engine and its
own volume, then use the existing authenticated `marka admin jobs reindex-all`
operation if writes have occurred. The verified router clears the text index
and queues every current bookmark for indexing. Wait for that queue to drain
and verify current content and tenant isolation. Vector documents were zero at
preflight; if that changes, separately verify vector recovery without silently
triggering external embedding regeneration. If keeping the v2 renderer during
a search-only rollback, preserve Marka's `timeout=0` override instead of
restoring an incompatible v1 endpoint setting.

Original rollback references:

- Meilisearch: `getmeili/meilisearch@sha256:860fa4baed04ae1c235de870edab0c8006227546dea1bbb6411fbfc5e27cf1db`
- Browserless: `browserless/chrome@sha256:57d19e414d9fe4ae9d2ab12ba768c97f38d51246c5b31af55a009205c136012f`
- Watchtower: `ghcr.io/nicholas-fedor/watchtower@sha256:d70208d28ab2fb21f37ac09c58bee75160c0f88d46503f1bc0b5d92a81d35032`

Restoring these infrastructure versions does not require restoring an old Marka
release or rewinding user data. If rollback cannot satisfy readiness and current
data checks, leave the updater paused, preserve evidence, and report the exact
remaining failure rather than resuming unchecked updates.
