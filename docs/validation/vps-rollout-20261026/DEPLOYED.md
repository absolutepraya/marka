# Personal VPS rollout, 26 October 2026

The user approved the [reviewed plan](PLAN.md), and all three dependency
upgrades are live. [deployment.json](deployment.json) records the sanitized
runtime checks. The application remains release **0.14.0**, commit
`56e4aba47e2a10642f96c41e2ea42cb4d5583545`, on its original web and worker
images. No application release was deployed during this operation.

| Dependency | Deployed version | Result |
| --- | --- | --- |
| Meilisearch | 1.55.0, reviewed immutable digest | Fresh dump imported into a new external volume; original volume retained. |
| Browserless | 2.57.3, reviewed immutable digest | 1536 MiB memory, 256 MiB shared memory, one CPU, two sessions, four queued sessions. |
| Watchtower | 1.23.2, reviewed immutable digest | Canonical Compose ownership restored; scheduled scan selected exactly web and workers. |

RSSHub was recreated from its already-running immutable image digest. Its
token-protected endpoint, finite renderer timeout, Redis, separate real-browser
helper, and Instagram configuration were preserved. Marka alone receives the
v2 `timeout=0` override for reused connections. Existing crawler concurrency
and search settings are unchanged. No embeddings were regenerated.

## Execution and recovery artifacts

The maintenance timer started at **15:39:18 WIB**. Web and worker readiness
passed at **15:44:33 WIB**, 314.22 seconds later. This measures maintenance
start through both ready checks, not a continuous external outage probe.
The remaining functional, updater, and cleanup checks ran with Marka online.

Both app producers stopped gracefully with exit code zero. The complete app
volume, original search volume, exact configuration including credential files,
fresh search dump, and frozen search snapshot were preserved in a mode-0700
directory:

`/Users/absolutepraya/Documents/Backups/marka-vps-rollout-20261026-153619`

All five initial artifact hashes matched after transfer, and all three archives
were readable before migration. Retained files have restrictive permissions.
The original and new search volumes both remain on the VPS. The old volume has
no running writer; only production Meilisearch mounts the new volume. Original
application and dependency image IDs are still available for rollback.

The new external volume is `karakeep_meilisearch_v155_20261026`. Its name was
appended to the existing Marka `.env`; no other existing entry was replaced.
The local canonical `deploy/docker-compose.prod.yml` matches the final live
Compose hash. The RSSHub changes were applied to its inspected live file.

## Production checks

- All 691 original full-text documents and zero vector documents survived the
  import. Document bodies and configured search settings matched the frozen
  snapshot. Twelve query checks passed, including tenant filtering, date
  sorting, pagination, and original-hit ordering. The only expanded matches
  were the two previously reviewed rebuild differences, 54 to 70 and 5 to 9.
- The database contains 1178 bookmarks across four users. Twelve checked library
  tables, including users, bookmarks, content, lists, memberships, tags, assets,
  highlights, and collaborators, had identical full-row fingerprints before
  the rollout and after the test bookmark was deleted. Search coverage was
  preserved at its existing count; this was not a full-library reindex.
- One unique public test bookmark was created through existing owner API
  authentication. Its crawl succeeded, its title appeared in production
  search, and its stored 60216-byte JPEG was retrieved through the authenticated
  asset endpoint and visually inspected. Only that new bookmark was deleted.
  Its API lookup then returned 404, and its search result disappeared.
- Crawl and indexing queues drained after the test. The 16 existing failed
  crawls did not increase. The 350 existing pending embedding records were
  unchanged. These historical records were not retried or repaired.
- The actual RSSHub CCAC feed returned HTTP 200 with the same item-ID checksum
  as the rehearsal. The new production renderer logged the upstream CCAC
  target, proving that the feed used it.
- Web health, the worker's actual `/ready` endpoint, and public HTTPS
  `/api/version` passed. Workers have no Docker health check and suppress
  startup listening logs, so their automatic port was discovered from listening
  sockets inside the container. The public sign-in page was inspected in the
  T3 browser; an authenticated dashboard UI session was not exercised.
- All 21 production containers are running with no unhealthy configured health
  checks. The 15 unrelated containers retained their original IDs and start
  times. The renderer network has exactly its original three service members,
  and Browserless has no published host port.

## Capacity and updater

The host guard collected 126 samples without a failed gate. Available memory
remained at or above 2523204 KiB, about 2.41 GiB. Maximum swap growth above the
preflight baseline was 3344 KiB, about 3.27 MiB.

The new renderer's measured kernel memory peak was 694931456 bytes, about
663 MiB, under the 1536 MiB cap. All six changed containers had zero restarts,
memory-limit events, OOM events, and OOM kills at final verification. These are
bounded rollout observations, not worst-case site capacity guarantees.

Watchtower reports Docker API 1.55 and correct ownership paths under
`/home/praya/marka`. Its scheduled scan completed with `scanned=2`, `failed=0`,
and `updated=0`; ordinary 60-second polling is resumed. It also warns that it
cannot retrieve image metadata for the unrelated locally built
`mcp-hub-rsshub-1` image. That container was not selected for update or changed,
and the selected two-container scan succeeded.

The initial rollout driver expected the older Watchtower log message spelling
and timed out after a successful scan. Verification was corrected to the
observed `Update session completed` message and lowercase counters. No service
rollback was needed. Final cgroup readings came from the host because the
minimal Watchtower image has no shell.

## Cleanup and remaining scope

The importer, proxy candidates, temporary migration directory, and temporary
credential files were removed. Eighteen remote and local artifact hashes
matched before migration-directory removal. Both search volumes and original
images were deliberately retained; no broad prune or volume deletion ran.

The canonical personal VPS Compose and operator documentation are updated in
this working tree. At the production cutover, local development, portable
installer, Kubernetes, seed, and E2E runtime defaults remained unchanged. The
four native Mac workspaces were subsequently upgraded in a separate approved
[local rollout](../local-upgrade-20261026/RESULTS.md); the other runtime defaults
remain outside that scope. Instagram repair remains separate. The retained rollback plan still
applies: once writes resume, preserve current SQLite/assets and rebuild search
if returning to the older search engine, rather than restoring stale app data.
