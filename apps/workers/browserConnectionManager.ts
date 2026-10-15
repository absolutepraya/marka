import { abortRace, raceWith, timeoutRace } from "./utils";

/** A worker-owned connection; each caller must still create its own context. */
interface BrowserConnection {
  isConnected(): boolean;
  on(event: "disconnected", listener: () => void): unknown;
  close(): Promise<void>;
}

export class BrowserConnectionManager<T extends BrowserConnection> {
  private browser: T | undefined;
  private connecting: Promise<T | undefined> | undefined;
  private closing: Promise<void> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private users = 0;
  private stopped = false;
  private references = new Map<T, number>();
  private retired = new Set<T>();
  private closingBrowsers = new Map<T, Promise<void>>();

  constructor(
    private readonly connect: () => Promise<T | undefined>,
    private readonly onCloseError: (error: unknown) => void,
    private readonly idleTimeoutMs = 30_000,
  ) {}

  async acquire(signal?: AbortSignal) {
    if (this.stopped) throw new Error("Browser connection manager is stopped");
    signal?.throwIfAborted();
    clearTimeout(this.idleTimer);
    this.users++;
    let released = false;
    let leasedBrowser: T | undefined;
    const release = () => {
      if (released) return;
      released = true;
      this.users--;
      if (leasedBrowser) {
        const remaining = (this.references.get(leasedBrowser) ?? 1) - 1;
        if (remaining > 0) this.references.set(leasedBrowser, remaining);
        else {
          this.references.delete(leasedBrowser);
          if (this.retired.has(leasedBrowser))
            void this.closeBrowser(leasedBrowser);
        }
      }
      if (this.users === 0 && !this.stopped) {
        this.idleTimer = setTimeout(() => {
          void this.closeCurrent();
        }, this.idleTimeoutMs);
        this.idleTimer.unref();
      }
    };
    try {
      // Do not consume another renderer slot while an idle disconnect finishes.
      await this.closing;
      signal?.throwIfAborted();
      if (this.stopped)
        throw new Error("Browser connection manager is stopped");
      const reused = !!this.browser?.isConnected();
      if (!reused && !this.connecting) {
        this.connecting = this.connect()
          .then(async (browser) => {
            if (this.stopped) {
              if (browser) await this.closeBrowser(browser);
              throw new Error("Browser connection manager is stopped");
            }
            this.browser = browser;
            browser?.on("disconnected", () => {
              this.retired.delete(browser);
              // A late event from an old connection must not evict its replacement.
              if (this.browser === browser) this.browser = undefined;
            });
            if (browser && !browser.isConnected()) {
              this.browser = undefined;
              throw new Error("Browser disconnected during connection setup");
            }
            return this.browser;
          })
          .finally(() => {
            this.connecting = undefined;
          });
      }
      const browser = reused ? this.browser : await this.connecting;
      signal?.throwIfAborted();
      leasedBrowser = browser;
      if (browser)
        this.references.set(browser, (this.references.get(browser) ?? 0) + 1);
      const retire = () => {
        if (!leasedBrowser) return;
        if (this.browser === leasedBrowser) this.browser = undefined;
        if (!leasedBrowser.isConnected()) return;
        this.retired.add(leasedBrowser);
        if (!this.references.has(leasedBrowser)) {
          void this.closeBrowser(leasedBrowser);
        }
      };
      return { browser, reused, release, retire };
    } catch (error) {
      release();
      throw error;
    }
  }

  private closeBrowser(browser: T): Promise<void> {
    const existing = this.closingBrowsers.get(browser);
    if (existing) return existing;
    if (!browser.isConnected()) return Promise.resolve();
    const closing = (async () => {
      try {
        await raceWith(
          browser.close(),
          timeoutRace<void>(5_000, () => {
            throw new Error("Browser disconnect timed out");
          }),
        );
        this.retired.delete(browser);
      } catch (error) {
        if (!browser.isConnected()) this.retired.delete(browser);
        this.onCloseError(error);
      }
    })().finally(() => this.closingBrowsers.delete(browser));
    this.closingBrowsers.set(browser, closing);
    return closing;
  }

  private closeCurrent() {
    const browser = this.browser;
    this.browser = undefined;
    if (browser) this.closing = this.closeBrowser(browser);
    return this.closing;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.idleTimer);
    await this.connecting?.catch(() => undefined);
    await Promise.all([
      this.closeCurrent(),
      ...[...this.retired].map((browser) => this.closeBrowser(browser)),
    ]);
    await Promise.all(this.closingBrowsers.values());
  }
}

/** Cancel context creation promptly and reclaim any context returned afterward. */
export async function createBrowserContextWithAbort<T>(
  create: () => Promise<T>,
  signal: AbortSignal,
  cleanupAbandoned: (context: T) => Promise<void>,
): Promise<T> {
  signal.throwIfAborted();
  const pending = create();
  try {
    const context = await raceWith(pending, abortRace(signal));
    signal.throwIfAborted();
    return context;
  } catch (error) {
    void pending.then(cleanupAbandoned, () => undefined).catch(() => undefined);
    throw error;
  }
}
