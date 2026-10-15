import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { expect, it } from "vitest";

import {
  BrowserConnectionManager,
  createBrowserContextWithAbort,
} from "./browserConnectionManager";
import { buildBrowserlessWebSocketUrl } from "./browserlessConnector";

// Explicit opt-in through scripts/test-browserless-reuse.mjs. No public sites or app data.
it.skipIf(process.env.CRAWLER_BROWSERLESS_INTEGRATION !== "1")(
  "validates Browserless reuse, isolation, recovery, session lifetime, and cleanup",
  async () => {
    const endpoint = process.env.CRAWLER_BROWSERLESS_TEST_URL;
    const token = process.env.CRAWLER_BROWSERLESS_TEST_TOKEN;
    if (!endpoint || !token)
      throw new Error("Local Browserless test configuration is missing");
    const url = new URL(endpoint);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "ws:")
      throw new Error("This test requires loopback Browserless");
    const closeErrors: string[] = [];
    const connect = async (reuse: boolean) => {
      try {
        return await chromium.connectOverCDP(
          buildBrowserlessWebSocketUrl(endpoint, token, reuse),
          { timeout: 5000 },
        );
      } catch {
        // Playwright connection errors contain the token-bearing URL.
        throw new Error(
          "Local Browserless connection failed within the crawler's 5-second deadline",
        );
      }
    };
    const results = [];
    const jobs = 24;
    try {
      for (const { reuse, concurrency } of [
        ...(process.env.CRAWLER_BROWSERLESS_BASELINE === "1"
          ? [{ reuse: false, concurrency: 1 }]
          : []),
        { reuse: true, concurrency: 1 },
        { reuse: true, concurrency: 2 },
        { reuse: true, concurrency: 4 },
      ]) {
        let connections = 0;
        let acquisitionMs = 0;
        const acquisitionTimes: number[] = [];
        const manager = new BrowserConnectionManager(
          async () => {
            const browser = await connect(reuse);
            connections++;
            return browser;
          },
          (error) => closeErrors.push(String(error)),
        );
        const start = performance.now();
        const rssBefore = process.memoryUsage().rss;
        const durations: number[] = [];
        let completed = 0;
        console.log(
          "BROWSERLESS_PHASE",
          JSON.stringify({ reuse, concurrency, state: "start" }),
        );
        const job = async (id: number) => {
          const began = performance.now();
          const acquiring = performance.now();
          const lease = reuse
            ? await manager.acquire()
            : {
                browser: await connect(false),
                release: () => undefined,
              };
          if (!reuse) connections++;
          const elapsedAcquisition = performance.now() - acquiring;
          acquisitionMs += elapsedAcquisition;
          acquisitionTimes.push(elapsedAcquisition);
          const browser = lease.browser!;
          let context;
          try {
            context = await browser.newContext({ serviceWorkers: "block" });
            expect((await context.cookies()).length).toBe(0);
            await context.route("**/*", (route) =>
              route.fulfill({
                contentType: "text/html",
                body: "<html><title>Isolated fixture</title><body>Local fixture</body></html>",
              }),
            );
            const page = await context.newPage();
            await page.goto("https://crawler-fixture.invalid/");
            expect(await page.evaluate(() => localStorage.length)).toBe(0);
            await page.evaluate(
              (value) => localStorage.setItem("job", String(value)),
              id,
            );
            await context.addCookies([
              {
                name: "job",
                value: String(id),
                url: "https://crawler-fixture.invalid/",
              },
            ]);
            if (id === 5) throw new Error("simulated job failure");
            if (id === 6) {
              await page.route("**/hang", () => undefined);
              await expect(
                page.goto("https://crawler-fixture.invalid/hang", {
                  timeout: 250,
                }),
              ).rejects.toThrow();
              await page.goto("https://crawler-fixture.invalid/recovered");
            }
            expect(await page.title()).toBe("Isolated fixture");
            completed++;
          } finally {
            try {
              await context?.close();
            } finally {
              lease.release();
              if (!reuse) await browser.close();
            }
            durations.push(performance.now() - began);
          }
        };
        try {
          for (let id = 0; id < jobs; id += concurrency) {
            const batch = await Promise.allSettled(
              Array.from({ length: concurrency }, (_, n) => job(id + n)),
            );
            for (const result of batch)
              if (
                result.status === "rejected" &&
                String(result.reason) !== "Error: simulated job failure"
              )
                throw result.reason;
          }
          expect(completed).toBe(jobs - 1);
          expect(connections).toBe(reuse ? 1 : jobs);
          if (reuse) {
            const inspection = await manager.acquire();
            expect(inspection.browser!.contexts().length).toBe(1);
            inspection.release();
          }
          const percentile = (values: number[], p: number) =>
            Math.round(
              [...values].sort((a, b) => a - b)[
                Math.ceil(values.length * p) - 1
              ]!,
            );
          results.push({
            reuse,
            concurrency,
            jobs,
            completed,
            connections,
            acquisitionMs: Math.round(acquisitionMs),
            acquisitionP50Ms: percentile(acquisitionTimes, 0.5),
            elapsedMs: Math.round(performance.now() - start),
            jobP50Ms: percentile(durations, 0.5),
            jobP95Ms: percentile(durations, 0.95),
            nodeRssDeltaMb: Math.round(
              (process.memoryUsage().rss - rssBefore) / 1024 / 1024,
            ),
          });
        } finally {
          await manager.stop();
          console.log(
            "BROWSERLESS_PHASE",
            JSON.stringify({ reuse, concurrency, state: "end" }),
          );
        }
      }
      console.log("BROWSERLESS_RESULTS", JSON.stringify(results));
      let connections = 0;
      const manager = new BrowserConnectionManager(
        async () => {
          connections++;
          return connect(true);
        },
        (error) => closeErrors.push(String(error)),
      );
      try {
        const lease = await manager.acquire();
        const browser = lease.browser!;
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.setContent("<title>Survives server timeout</title>");
        console.log(
          "BROWSERLESS_LIFETIME",
          "holding an active lease beyond the server's 60-second default",
        );
        await delay(65_000);
        expect(await page.title()).toBe("Survives server timeout");
        expect(connections).toBe(1);
        await context.close();
        lease.release();

        const canceledLease = await manager.acquire();
        const controller = new AbortController();
        let reclaimed = false;
        const pending = createBrowserContextWithAbort(
          async () => {
            const lateContext = await canceledLease.browser!.newContext();
            await delay(100);
            return lateContext;
          },
          controller.signal,
          async (lateContext) => {
            await lateContext.close();
            reclaimed = true;
          },
        );
        controller.abort();
        await expect(pending).rejects.toThrow();
        await expect.poll(() => reclaimed, { timeout: 10_000 }).toBe(true);
        expect(canceledLease.browser!.contexts().length).toBe(1);
        canceledLease.release();

        console.log(
          "BROWSERLESS_RECOVERY",
          "forcing a server-side browser disconnect",
        );
        const disconnected = await manager.acquire();
        const session = await disconnected.browser!.newBrowserCDPSession();
        await session.send("Browser.close").catch(() => undefined);
        await expect
          .poll(() => disconnected.browser!.isConnected(), { timeout: 10_000 })
          .toBe(false);
        disconnected.release();
        const recovered = await manager.acquire();
        console.log("BROWSERLESS_RECOVERY", "server-side disconnect recovered");
        expect(recovered.browser === disconnected.browser).toBe(false);
        expect(recovered.browser!.isConnected()).toBe(true);
        expect(connections).toBe(2);
        recovered.release();
        console.log(
          "BROWSERLESS_IDLE",
          "waiting for the default 30-second idle disconnect",
        );
        await expect
          .poll(() => recovered.browser!.isConnected(), {
            timeout: 40_000,
            interval: 500,
          })
          .toBe(false);
        const afterIdle = await manager.acquire();
        console.log("BROWSERLESS_IDLE", "idle disconnect recovered");
        expect(connections).toBe(3);
        const healthyContext = await afterIdle.browser!.newContext();
        const healthyPage = await healthyContext.newPage();
        await healthyPage.setContent("<title>Recovered</title>");
        expect(await healthyPage.title()).toBe("Recovered");
        await healthyContext.close();
        afterIdle.release();
        await manager.stop();
        expect(afterIdle.browser!.isConnected()).toBe(false);
        expect(closeErrors.length).toBe(0);
      } finally {
        await manager.stop();
      }
      console.log(
        "BROWSERLESS_LIFECYCLE",
        "session lifetime, canceled context cleanup, reconnect, idle cleanup, shutdown passed",
      );
    } catch (error) {
      // Preserve failure information without allowing token-bearing errors into logs.
      throw new Error(
        (error instanceof Error
          ? (error.stack ?? error.message)
          : String(error)
        ).replaceAll(token, "<redacted>"),
      );
    }
  },
  300_000,
);
