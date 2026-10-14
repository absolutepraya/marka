import { raceWith, timeoutRace } from "./utils";

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
    const release = () => {
      if (released) return;
      released = true;
      this.users--;
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
      return { browser, reused, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  private async closeBrowser(browser: T) {
    try {
      await raceWith(
        browser.close(),
        timeoutRace<void>(5_000, () => {
          throw new Error("Browser disconnect timed out");
        }),
      );
    } catch (error) {
      this.onCloseError(error);
    }
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
    await this.closeCurrent();
  }
}
