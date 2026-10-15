# Local Browserless reuse validation

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

## Rollout boundary

These tests supplement the local real-bookmark checks performed for PR #121, where both affected URLs and a screenshot-fallback page produced downloadable previews with reuse off and on. They preserve the production defaults: crawler concurrency 2 and browser reuse disabled.

Before a production enablement decision, validate an isolated Linux deployment on representative hardware with real queued crawls, the configured proxy, worker/container resource limits, long-running load, and before/after crawler tracing. Issue #37 remains open until the outstanding validation and rollout decision are completed.
