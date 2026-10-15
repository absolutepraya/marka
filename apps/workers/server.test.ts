import { describe, expect, it, vi } from "vitest";

vi.mock("@karakeep/shared/config", () => ({
  default: {
    workers: { host: "127.0.0.1", port: 0 },
    prometheus: { metricsToken: "test-token" },
  },
}));
vi.mock("@karakeep/shared/logger", () => ({ default: { info: vi.fn() } }));
vi.mock("./metrics", () => ({ printMetrics: vi.fn() }));

import { createWorkerApp } from "./server";

describe("worker readiness", () => {
  it("stays unavailable until initialization completes and clears on shutdown", async () => {
    const { app, setReady } = createWorkerApp();
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/ready")).status).toBe(503);

    setReady(true);
    const response = await app.request("/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });

    setReady(false);
    expect((await app.request("/ready")).status).toBe(503);
    expect((await app.request("/health")).status).toBe(200);
  });

  it("keeps separately created servers independent", async () => {
    const first = createWorkerApp();
    const second = createWorkerApp();
    first.setReady(true);
    expect((await first.app.request("/ready")).status).toBe(200);
    expect((await second.app.request("/ready")).status).toBe(503);
  });
});
