import { createServer } from "node:net";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { expect, it } from "vitest";

import {
  BrowserConnectionManager,
  createBrowserContextWithAbort,
} from "./browserConnectionManager";

// Explicit opt-in: requires local Playwright Chromium, no external services.
it.skipIf(process.env.CRAWLER_BROWSER_INTEGRATION !== "1")(
  "reuses real CDP connections with isolated contexts and bounded cleanup",
  async () => {
    const socket = createServer();
    await new Promise<void>((resolve) =>
      socket.listen(0, "127.0.0.1", resolve),
    );
    const address = socket.address();
    if (!address || typeof address === "string") throw new Error("No port");
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const owner = await chromium.launch({
      headless: true,
      args: [`--remote-debugging-port=${address.port}`],
    });
    const endpoint = `http://127.0.0.1:${address.port}`;
    const results = [];
    try {
      for (const { reuse, concurrency } of [
        { reuse: false, concurrency: 2 },
        { reuse: true, concurrency: 2 },
        { reuse: false, concurrency: 4 },
        { reuse: true, concurrency: 4 },
      ]) {
        let connections = 0;
        let acquisitionMs = 0;
        const connect = async () => {
          const start = performance.now();
          const browser = await chromium.connectOverCDP(endpoint);
          acquisitionMs += performance.now() - start;
          connections++;
          return browser;
        };
        const manager = new BrowserConnectionManager(connect, (error) => {
          throw error;
        });
        const start = performance.now();
        const rssBefore = process.memoryUsage().rss;
        let completed = 0;
        const crawl = async (id: number) => {
          const lease = reuse
            ? await manager.acquire()
            : { browser: await connect(), release: () => undefined };
          const browser = lease.browser!;
          const context = await browser.newContext({ serviceWorkers: "block" });
          try {
            expect(await context.cookies()).toEqual([]);
            await context.route("**/*", (route) =>
              route.fulfill({
                contentType: "text/html",
                body: "<html><title>Fixture</title><body>Isolated crawl</body></html>",
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
            if (id === 7) throw new Error("Simulated failed crawl");
            expect(await page.title()).toBe("Fixture");
            completed++;
          } finally {
            await context.close();
            lease.release();
            if (!reuse) await browser.close();
          }
        };
        try {
          for (let id = 0; id < 20; id += concurrency) {
            const settled = await Promise.allSettled(
              Array.from({ length: concurrency }, (_, offset) =>
                crawl(id + offset),
              ),
            );
            for (const result of settled) {
              if (result.status === "rejected")
                expect(result.reason.message).toBe("Simulated failed crawl");
            }
          }
          expect(completed).toBe(19);
          expect(connections).toBe(reuse ? 1 : 20);
          results.push({
            reuse,
            jobs: 20,
            concurrency,
            completed,
            connections,
            acquisitionMs: Math.round(acquisitionMs),
            elapsedMs: Math.round(performance.now() - start),
            nodeRssDeltaMb: Math.round(
              (process.memoryUsage().rss - rssBefore) / 1024 / 1024,
            ),
          });
          if (reuse) {
            const canceledLease = await manager.acquire();
            const controller = new AbortController();
            let lateCleaned = false;
            const creating = createBrowserContextWithAbort(
              () => canceledLease.browser!.newContext(),
              controller.signal,
              async (lateContext) => {
                await lateContext.close();
                lateCleaned = true;
              },
            );
            controller.abort();
            await expect(creating).rejects.toThrow();
            await expect.poll(() => lateCleaned).toBe(true);
            expect(canceledLease.browser!.contexts()).toHaveLength(1);
            canceledLease.release();
            const damaged = await manager.acquire();
            const survivor = await manager.acquire();
            const survivorContext = await survivor.browser!.newContext();
            const survivorPage = await survivorContext.newPage();
            await survivorPage.setContent("<title>Surviving crawl</title>");
            damaged.retire();
            damaged.release();
            const replacement = await manager.acquire();
            expect(replacement.browser).not.toBe(survivor.browser);
            expect(await survivorPage.title()).toBe("Surviving crawl");
            await survivorContext.close();
            survivor.release();
            await expect
              .poll(() => survivor.browser!.isConnected())
              .toBe(false);
            expect(replacement.browser!.isConnected()).toBe(true);
            replacement.release();
            const lease = await manager.acquire();
            expect(lease.browser!.contexts()).toHaveLength(1);
            await lease.browser!.close();
            lease.release();
            const next = await manager.acquire();
            expect(next.browser).not.toBe(lease.browser);
            expect(next.browser!.isConnected()).toBe(true);
            next.release();
          }
        } finally {
          await manager.stop();
        }
      }
      console.log("CDP connection benchmark:", JSON.stringify(results));
    } finally {
      await owner.close();
    }
  },
  60_000,
);
