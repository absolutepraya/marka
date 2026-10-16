# Browserless reuse validation

Related issue: [#37](https://github.com/absolutepraya/marka/issues/37).

## Environment and method

The 2026-10-15 run used Node 24.18.1 on an Apple Silicon M4 Mac, with Browserless running as an emulated `linux/amd64` container capped at 1 GiB. The renderer image was `browserless/chrome@sha256:57d19e414d9fe4ae9d2ab12ba768c97f38d51246c5b31af55a009205c136012f`, matching the personal production renderer. Its default connection lifetime was 60 seconds; reused sessions requested `timeout=-1`. Connections retained the crawler's five-second acquisition deadline.

Run the checks through `pnpm dev:test:browserless`, adding `--with-baseline` for the matched sequential comparison. Run without other builds or renderer clients. The command reads only the local renderer token and redacts it from output. It does not change application worker settings, create bookmarks, or contact production.

Each measured phase uses 24 synthetic jobs. Every job creates its own context, checks empty cookies/local storage, writes isolated state, and closes the context. One job intentionally throws after writing state. Another navigation deliberately times out, then recovers. Therefore 23 completed jobs and one injected failure per phase is the expected result. The final context count must return to the default context only.

The fixture intercepts requests locally. It measures connection/context overhead, not public-site rendering, screenshot encoding, proxy throughput, or queue scheduling. Acquisition wait is summed across callers, so concurrent first acquisitions can each include the same connection setup wait. RSS deltas reflect the native test process and garbage collection, not production worker memory. Renderer peaks are sampled rather than continuous.

## Standalone comparison results

The complete suite passed in 209 seconds with other local builds stopped. Each row ran 24 jobs: 23 completed and one failed deliberately. All four forced navigation timeouts recovered. The results below come from that standalone run, not the earlier partial run.

| Reuse | Concurrency | Connections | Median acquisition | Median job | Job p95 | Phase duration | Sampled renderer peak | Native Node RSS delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Off | 1 | 24 | 1,687 ms | 2,606 ms | 2,981 ms | 63.549 s | 688 MiB | +9 MiB |
| On | 1 | 1 | <1 ms | 766 ms | 1,053 ms | 20.835 s | 655 MiB | +29 MiB |
| On | 2 | 1 | <1 ms | 918 ms | 2,664 ms | 13.130 s | 684 MiB | +31 MiB |
| On | 4 | 1 | <1 ms | 1,121 ms | 3,044 ms | 9.062 s | 655 MiB | +32 MiB |

In the matched sequential comparison, reuse reduced connections from 24 to one and median synthetic-job duration by about 71%. Pool shutdown is excluded from phase duration. This is a measurement of this Browserless fixture on this host, not a production performance estimate.

The same run passed the 65-second active lease, late-context reclamation after cancellation, server-side browser termination and automatic reconnect, the default 30-second idle disconnect, and final shutdown checks. No leftover job contexts or close errors were observed.

The existing direct-CDP Chromium integration also passed all 80 jobs with its expected injected failures. Its short phase timings were mixed: concurrency 2 took 949 ms without reuse and 1,347 ms with reuse, while concurrency 4 took 937 ms and 520 ms respectively. Those results do not support a universal Chrome throughput claim.

## Limits found during validation

A concurrency-2 baseline with reuse off reached a sampled 999 MiB and failed to connect within five seconds. The matched sequential comparison fits the same cap and provides a controlled latency comparison, but it does not establish the capacity of separate concurrent sessions on the VPS. Do not raise production limits or enable reuse based on this Mac's emulation behavior.

An initial lifecycle run passed. A later run finished all four benchmark phases (92 completions and four expected injected failures), but missed the five-second reconnect deadline while other local tests/builds were running. That failure remains relevant: cold browser startup under host load can exceed the existing deadline. Repeat measurements with the renderer and host idle; a fixture benchmark cannot certify production reliability.

Although sampled peaks stayed below the cap, the cgroup `max` counter rose from 31,946 to 32,087 over the standalone validation window. That records additional memory-limit pressure which the periodic samples can miss. `oom` and `oom_kill` stayed zero, and the container restart count stayed zero. Passing this run does not establish safe production memory headroom. The runner reports cgroup memory events when available on future runs.

## Isolated Linux queued-crawl validation

The 2026-10-15 Linux run used separate test containers on the Debian 12 x86_64 VPS, with fresh SQLite/assets state, a synthetic account, a separate Docker network, and no published ports. It used the configured working crawler proxy, supplied privately on the VPS. Production containers, data, settings, and the shared production renderer were not modified. The host itself remained shared with production services.

The cached worker image was pinned to `sha256:944770ac93431ec57665458b173c9f684a0807611988f43a94daad1092f3cd51`, source revision `4e38ff15d88831893846dad7366a1aa4a7bc1bea`. The renderer used the pinned Browserless v1 digest above. Each test container had a 1 GiB memory cap, no additional swap allowance, and a one-CPU limit. Only the crawler worker was enabled; web, search, AI, email, and the other workers were excluded. Queue seeding/status helpers ran inside the worker's memory limit. These measurements validate the crawler path rather than whole-stack capacity.

The controller checked host available memory and cgroup memory every two seconds, with a 1 GiB host-memory stop threshold, OOM/restart checks, per-batch deadlines, and an independent 45-minute deadline with cleanup. Traces stayed in local test logs. An initial startup attempt stalled downloading the adblock list before any jobs were queued. The measured run used a read-only, checksum-matched copy of the existing production adblock cache, representing a warm worker. The cold-download problem remains outside these measurements.

Each matched phase queued 12 crawls through the bundled Liteque implementation, rotating `https://example.com/`, `https://homebrew.page/app/PPSA99581/`, and `https://github.com/D3ATHLY/blackbox`. Containers were recreated between phases. Every phase finished with 12 successful crawls, nonempty titles, successful HTTP status codes, and 12 preview assets whose saved file sizes matched the database. Example.com exercised screenshot fallback. The three saved preview images from the reuse-on/concurrency-2 batch were also opened and visually checked; all contained visible content. Bookmark rows were seeded directly, so timings exclude the bookmark-creation API and UI.

| Reuse | Concurrency | Browser launches | Retried failed attempts | Median acquisition | Successful crawl median / p95 | Sampled worker peak | Sampled renderer peak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Off | 1 | 14 | 2 | 861 ms | 14.954 / 37.424 s | 364 MiB | 379 MiB |
| On | 1 | 1 | 0 | 0.177 ms | 16.794 / 41.147 s | 363 MiB | 363 MiB |
| Off | 2 | 12 | 0 | 1,286 ms | 21.433 / 32.583 s | 426 MiB | 479 MiB |
| On | 2 | 1 | 0 | 0.149 ms | 15.995 / 41.880 s | 373 MiB | 394 MiB |

Acquisition figures include the cold first acquisition and concurrent callers waiting for it. Their p95 values were 2,428 ms, 2,041 ms, 1,791 ms, and 1,966 ms in table order. Successful crawl spans exclude failed attempts and queue wait; p95 uses the nearest-rank sample. Container peaks are sampled cgroup charged memory, including cache and helper processes, rather than Node RSS alone. All four matched phases recorded zero cgroup `max`, `oom`, and `oom_kill` events.

These small, ordered public-site batches demonstrate connection reuse and lower acquisition overhead. They do not establish a fixed end-to-end speedup: the sequential successful-job median and both successful-job p95 values were higher with reuse, while navigation/proxy response times varied. The two baseline navigation timeouts recovered through normal queue retries. No batch was rerun to improve its result.

Batch elapsed times, including queueing, retries, and status polling, were 298.290 s, 231.135 s, 132.922 s, and 118.914 s in table order. Those single-run differences cannot separate the effect of reuse from upstream variation and retries. Provider-billed proxy bandwidth was not metered.

The reuse-on/concurrency-2 soak submitted 16 additional jobs one minute apart and passed in 913.748 s from first submission through final verification. All 16 produced successful status codes, titles, and saved previews, with no failed attempts. Its 14 browser launches for 16 jobs exercised repeated idle disconnect/reconnect as well as reuse when a connection remained active. Acquisition median/p95 was 915/1,988 ms, below the existing five-second deadline. Sampled worker/renderer peaks were 351/336 MiB. This was periodic traffic with idle gaps, not sustained saturation.

Across all 64 successful crawls and the approximately 29-minute measured run, no cgroup memory-limit, OOM, or OOM-kill events were recorded, and the restart watchdog did not trigger. Minimum host available memory was 2,199 MiB. Test containers and their network were removed afterward. Production web/worker container IDs and states matched their initial values; web remained healthy and workers remained running. Private logs, metrics, and the three inspected previews were retained under this worktree's `.data/`, with a check that exported logs did not contain the proxy password. The test directory and results also remain on the VPS.

## Rollout boundary

These tests supplement the local real-bookmark checks performed for PR #121, where both affected URLs and a screenshot-fallback page produced downloadable previews with reuse off and on. They preserve the production defaults: crawler concurrency 2 and browser reuse disabled.

The isolated Linux run adds real queued-crawl, proxy, resource-limit, idle-reconnect, and before/after tracing evidence at concurrency 2. It supports a monitored production trial at that concurrency; it does not validate concurrency 4 or whole-stack saturation. Production remains at concurrency 2 with reuse disabled. Issue #37 remains open pending the production rollout decision.
