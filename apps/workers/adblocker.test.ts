import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAdblocker } from "./adblocker";

afterEach(() => vi.useRealTimers());

describe("adblocker startup", () => {
  it("bounds a stalled list download so crawler startup can continue", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(
      (_url: string, options?: { signal?: AbortSignal }) => {
        signal = options?.signal;
        return new Promise<never>(() => {
          /* Simulate a download that never settles. */
        });
      },
    );
    const result = loadAdblocker(fetcher, undefined, 100);
    const assertion = expect(result).rejects.toThrow(
      "Adblocker initialization timed out",
    );
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
    await vi.runAllTimersAsync();
  });

  it("cancels downloads and prevents retries from opening new requests", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const result = loadAdblocker(fetcher, undefined, 100);
    const assertion = expect(result).rejects.toThrow(
      "Adblocker initialization timed out",
    );
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    const calls = fetcher.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    await vi.runAllTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a cached blocker without downloading lists", async () => {
    const blocker = PlaywrightBlocker.parse("");
    const fetcher = vi.fn();
    const loaded = await loadAdblocker(fetcher, {
      path: "fixture",
      read: async () => Buffer.from(blocker.serialize()),
      write: async () => {
        /* Cached reads should avoid writes. */
      },
    });
    expect(loaded).toBeInstanceOf(PlaywrightBlocker);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
