import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserConnectionManager,
  createBrowserContextWithAbort,
} from "./browserConnectionManager";

class FakeBrowser extends EventEmitter {
  connected = true;
  close = vi.fn(async () => {
    this.connected = false;
    this.emit("disconnected");
  });
  isConnected() {
    return this.connected;
  }
}

function setup() {
  const browsers: FakeBrowser[] = [];
  const connect = vi.fn(async () => {
    const browser = new FakeBrowser();
    browsers.push(browser);
    return browser;
  });
  const onError = vi.fn();
  return {
    manager: new BrowserConnectionManager(connect, onError),
    connect,
    browsers,
    onError,
  };
}

afterEach(() => vi.useRealTimers());

describe("crawler browser connection reuse", () => {
  it("shares one connection across concurrent and sequential jobs", async () => {
    vi.useFakeTimers();
    const { manager, connect } = setup();
    const [a, b] = await Promise.all([manager.acquire(), manager.acquire()]);
    expect(a.browser).toBe(b.browser);
    expect(connect).toHaveBeenCalledTimes(1);
    a.release();
    b.release();
    const c = await manager.acquire();
    expect(c.browser).toBe(a.browser);
    expect(c.reused).toBe(true);
    c.release();
    await manager.stop();
    expect(a.browser?.close).toHaveBeenCalledTimes(1);
  });

  it("disconnects after idle time, but never while another job is active", async () => {
    vi.useFakeTimers();
    const { manager, connect } = setup();
    const a = await manager.acquire();
    const b = await manager.acquire();
    a.release();
    a.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.browser?.close).not.toHaveBeenCalled();
    b.release();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(a.browser?.close).toHaveBeenCalledTimes(1);
    const c = await manager.acquire();
    expect(connect).toHaveBeenCalledTimes(2);
    c.release();
    await manager.stop();
  });

  it("reconnects after disconnect and ignores stale disconnect events", async () => {
    vi.useFakeTimers();
    const { manager } = setup();
    const a = await manager.acquire();
    await a.browser!.close();
    a.release();
    const b = await manager.acquire();
    expect(b.browser).not.toBe(a.browser);
    a.browser!.emit("disconnected");
    const c = await manager.acquire();
    expect(c.browser).toBe(b.browser);
    b.release();
    c.release();
    await manager.stop();
  });

  it("retries a failed connection without retaining a rejected promise", async () => {
    vi.useFakeTimers();
    const { manager, connect } = setup();
    connect.mockRejectedValueOnce(new Error("unavailable"));
    await expect(manager.acquire()).rejects.toThrow("unavailable");
    const lease = await manager.acquire();
    expect(lease.browser).toBeDefined();
    lease.release();
    await manager.stop();
  });

  it("closes a connection that finishes connecting during shutdown", async () => {
    const browser = new FakeBrowser();
    let resolve!: (browser: FakeBrowser) => void;
    const manager = new BrowserConnectionManager(
      () =>
        new Promise<FakeBrowser>((r) => {
          resolve = r;
        }),
      vi.fn(),
    );
    const acquiring = manager.acquire();
    await Promise.resolve();
    const stopping = manager.stop();
    resolve(browser);
    await expect(acquiring).rejects.toThrow("stopped");
    await stopping;
    expect(browser.close).toHaveBeenCalledTimes(1);
    await expect(manager.acquire()).rejects.toThrow("stopped");
  });

  it("releases an aborted waiter without disrupting another crawl", async () => {
    vi.useFakeTimers();
    const { manager } = setup();
    const abort = new AbortController();
    const pending = manager.acquire(abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow();
    const active = await manager.acquire();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(active.browser?.close).not.toHaveBeenCalled();
    active.release();
    await manager.stop();
  });

  it("bounds a hung disconnect so the next job can reconnect", async () => {
    vi.useFakeTimers();
    const { manager, onError } = setup();
    const a = await manager.acquire();
    a.browser!.close.mockImplementationOnce(() => new Promise(() => undefined));
    a.release();
    await vi.advanceTimersByTimeAsync(30_000);
    const pending = manager.acquire();
    await vi.advanceTimersByTimeAsync(5_000);
    const b = await pending;
    expect(b.browser).not.toBe(a.browser);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Browser disconnect timed out" }),
    );
    b.release();
    await manager.stop();
  });
});

describe("browser context creation cancellation", () => {
  it("rejects promptly and cleans up a late context after cancellation", async () => {
    let resolve!: (value: object) => void;
    const pending = new Promise<object>((r) => {
      resolve = r;
    });
    const cleanup = vi.fn(async () => undefined);
    const abort = new AbortController();
    const creation = createBrowserContextWithAbort(
      () => pending,
      abort.signal,
      cleanup,
    );
    abort.abort();
    await expect(creation).rejects.toThrow();
    expect(cleanup).not.toHaveBeenCalled();
    const context = {};
    resolve(context);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledWith(context);
  });

  it("does not allocate a context for an already canceled job", async () => {
    const create = vi.fn(async () => ({}));
    const abort = new AbortController();
    abort.abort();
    await expect(
      createBrowserContextWithAbort(create, abort.signal, vi.fn()),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
