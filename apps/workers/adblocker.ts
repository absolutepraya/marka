import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";

type BlockerFetch = NonNullable<
  Parameters<typeof PlaywrightBlocker.fromPrebuiltFull>[0]
>;
type BlockerCache = Parameters<typeof PlaywrightBlocker.fromPrebuiltFull>[1];
type AbortableFetch = (
  url: string,
  options?: { signal?: AbortSignal },
) => ReturnType<BlockerFetch>;

// Optional remote lists must not hold worker readiness indefinitely. Bound the
// entire load, including response bodies, cache I/O, and library retries.
export async function loadAdblocker(
  fetcher: AbortableFetch,
  cache?: BlockerCache,
  timeoutMs = 10_000,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Adblocker initialization timed out"));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      PlaywrightBlocker.fromPrebuiltFull(async (url) => {
        controller.signal.throwIfAborted();
        return fetcher(url, { signal: controller.signal });
      }, cache),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
