# Native VPS rehearsal plan, approved 26 October 2026

The user approved this plan in the conversation before the first VPS write.
Execution and cleanup are complete. See [results and remaining gates](RESULTS.md).
The proposal below is retained as the reviewed scope, rather than a current
instruction to create another staging environment.

The exact proposed new Compose file is `compose.yaml` in this directory.
It will be installed as a new file at
`/home/praya/marka-upgrade-rehearsal-20261026/compose.yaml`.
That directory did not exist at the read-only preflight. Neither production
Compose file will be edited. This plan is a staging experiment, not a cutover.

## Current preflight

26 October 2026, Asia/Jakarta. VPS available memory was approximately 2264 MiB,
with 2169 MiB swap used. Disk had about 51 GiB free. All existing containers
were running; those with health checks reported healthy. This is a snapshot,
not a capacity guarantee.

The production Meilisearch instance reported 691 full-text documents, a
120438784-byte database, and zero vector documents. Its vector embedder is
configured for 1536 dimensions. Neither index was indexing during the query.
Therefore the native production-data import can validate the actual full-text
corpus, but cannot establish production-vector migration coverage. Synthetic
vector tests from the earlier experiment remain the vector compatibility proof.

No X-account watches were enabled in the live watch configuration. Instagram
watches were enabled, including `beyondthefundamental` and `investart_id`.
Testing an X route must not enable any watcher or delivery job.

## Proposed writes and runtime effects

1. Create the new staging directory with mode 0700, the new Compose file, and
   generated staging-only `.meili.env` and `.renderer.env` files with mode 0600.
   No credential values belong in this repository, the plan, command arguments,
   or printed output.
2. Request one live Meilisearch dump using its existing credentials inside its
   container/network. This creates a normal dump task and dump file in the
   existing Meilisearch volume, with temporary CPU/disk work. It does not
   rewrite documents, change settings, or migrate the live index.
3. Copy the completed dump to a new local backup under
   `/Users/absolutepraya/Documents/Backups/marka-vps-rehearsal-yyyymmdd-hhmmss`
   and verify its SHA-256 against the remote dump. Existing backup files must
   never be overwritten. A copy at the staging directory's `input.dump` is the
   read-only input for the target server. The live 1.41.0 database remains
   untouched. Dump contents are private library data and potentially contain
   index API keys; restrict permissions and do not print document bodies.
4. Pull the three exact pinned images. Run only the `search` profile first,
   creating its new named volume and private lab network. Import into the new
   volume with a 512 MiB limit. Compare document counts, IDs, relevant settings,
   tenant-filtered full text, pagination, and sorting with the source. Record
   only counts, checksums, and sanitized pass/fail summaries. Keep synthetic
   mutation tests away from the imported production indexes.
5. Stop and remove the staged search container before starting the `browser`
   profile. Preserve the staged search volume until evidence is collected and
   verified. The native renderer has a 1 GiB limit and two sessions; cloned
   RSSHub has a 512 MiB limit. All published test ports bind to loopback only.
6. Create `.rsshub.env` with mode 0600 using only the live RSSHub image's needed
   authentication/proxy/helper values, read locally on the VPS without printing
   them: `IG_COOKIE`, `IG_PROXY`, `TWITTER_AUTH_TOKEN`, and
   `PUPPETEER_REAL_BROWSER_SERVICE` when present. Use the generated renderer
   token in a new `PUPPETEER_WS_ENDPOINT` pointing to
   `ws://marka-rehearsal-browserless:3000/`. Do not copy the production Redis
   URL or an entire production env file. The clone uses its own memory cache.
7. Attach only the cloned RSSHub container to the existing `rsshub_default`
   network so its unchanged separate real-browser helper remains reachable.
   Existing network members and endpoints are not modified. Feed requests can
   consume that helper's capacity and authenticated upstream rate limits.
   No watchers, cron jobs, posting tools, or delivery code are invoked.
8. Through loopback/SSH forwarding, run Marka's native-renderer lifecycle and
   content probes with `timeout=0`, then a bounded mixed Marka/RSSHub test.
   Compare representative authenticated Instagram and optional X feeds with
   the existing service. Never treat a cached or non-browser route as proof
   that Browserless was exercised: correlate renderer session metrics and
   report the actual request path used.
9. Sample host available memory, swap, candidate cgroup events, request errors,
   and existing container health. Run search and browser profiles separately.
   Do not begin if available memory is below 2 GiB. Abort and remove candidate
   workloads if available memory falls below 512 MiB, swap use rises more than
   256 MiB above its start baseline, any candidate is OOM-killed, or an existing
   service becomes unhealthy. Restrict sampling and requests to a bounded run.
10. Export sanitized evidence to the new local backup. Stop/remove only this
    exact staging project's containers, network, and new volume after artifact
    verification. Remove staging credential files. Keep the local dump backup;
    preserve the completed live dump unless separately cleaned up. Leave
    downloaded images cached. Verify the original services and app revision.

## Explicit exclusions

No production endpoint switch, production container restart, application image
publication, Watchtower update, production settings change, full embedding
regeneration, host package upgrade, Tailscale operation, reboot, or Hermes
source/runtime edit is included. Existing production data volumes are never
mounted into a candidate container. The only live Meilisearch write is creation
of its normal dump task/artifact.

The RSSHub clone is intentionally allowed authenticated read requests and access
to the existing separate real-browser helper. It is not fully disconnected from
production dependencies. This bounds the experiment while preserving relevant
proxy/helper behavior; report any inconclusive route rather than changing live
configuration to make it pass.

## Approval boundary

The user's machine instructions required the reviewed exact diff and approval
before the first VPS write from this Mac session. That approval was received.
The VPS Compose addition used the reviewed `/dev/null` to `compose.yaml` diff.
Runtime credential files contained generated or selectively reused secrets and
are described by key name only. A follow-up memory-only staging override was
used after the original shared workload reached its 1 GiB cap. All staging
resources and credential files were removed after evidence export.
