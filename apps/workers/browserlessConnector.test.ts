import { describe, expect, it } from "vitest";

import {
  buildBrowserlessWebSocketUrl,
  redactBrowserConnectionUrl,
} from "./browserlessConnector";

describe("Browserless connector", () => {
  it("builds a token-authenticated WebSocket URL", () => {
    expect(
      buildBrowserlessWebSocketUrl(
        "ws://shared-browserless:3000",
        "test-token",
      ),
    ).toBe("ws://shared-browserless:3000/?token=test-token");
  });

  it("uses worker-owned deadlines for reused Browserless sessions", () => {
    const url = new URL(
      buildBrowserlessWebSocketUrl(
        "ws://shared-browserless:3000",
        "test-token",
        true,
      ),
    );
    expect(url.searchParams.get("timeout")).toBe("-1");
    expect(url.searchParams.get("token")).toBe("test-token");
  });

  it.each(["0", "120000"])(
    "preserves an explicit operator session timeout %s",
    (timeout) => {
      const url = new URL(
        buildBrowserlessWebSocketUrl(
          `ws://shared-browserless:3000/?timeout=${timeout}`,
          "test-token",
          true,
        ),
      );
      expect(url.searchParams.get("timeout")).toBe(timeout);
    },
  );

  it("keeps provider defaults for per-job connections", () => {
    const url = new URL(
      buildBrowserlessWebSocketUrl(
        "ws://shared-browserless:3000",
        "test-token",
      ),
    );
    expect(url.searchParams.has("timeout")).toBe(false);
  });

  it("redacts Browserless tokens from connection URLs", () => {
    expect(
      redactBrowserConnectionUrl(
        "ws://shared-browserless:3000/?token=test-token",
      ),
    ).toBe("ws://shared-browserless:3000/?token=redacted");
  });

  it("requires a token for Browserless connections", () => {
    expect(() =>
      buildBrowserlessWebSocketUrl("ws://shared-browserless:3000", undefined),
    ).toThrow("BROWSERLESS_TOKEN is required when BROWSERLESS_URL is set");
  });
});
