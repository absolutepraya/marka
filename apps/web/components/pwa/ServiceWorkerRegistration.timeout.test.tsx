// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceWorkerRegistration, {
  usePwaLifecycle,
} from "./ServiceWorkerRegistration";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  register: vi.fn(),
  getRegistration: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  worker: { postMessage: vi.fn() },
}));

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

describe("ServiceWorkerRegistration version timeout", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: mocks.addEventListener,
        controller: mocks.worker,
        getRegistration: mocks.getRegistration,
        register: mocks.register,
        removeEventListener: mocks.removeEventListener,
      },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    mocks.getRegistration.mockResolvedValue(undefined);
    mocks.register.mockResolvedValue({ active: mocks.worker });
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ version: "development" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) {
        mock.mockReset();
      }
    }
    mocks.worker.postMessage.mockReset();
  });

  it("aborts a hung version check and allows a manual retry", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    mocks.fetch.mockImplementationOnce(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    function Probe() {
      const { checkForUpdate } = usePwaLifecycle();
      return <button onClick={() => void checkForUpdate()}>Retry</button>;
    }

    render(
      <ServiceWorkerRegistration>
        <Probe />
      </ServiceWorkerRegistration>,
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });

    const timeoutCall = setTimeoutSpy.mock.calls.find(
      ([, delay]) => delay === 10_000,
    );
    expect(timeoutCall).toBeDefined();
    const timeoutCallback = timeoutCall?.[0];
    if (typeof timeoutCallback !== "function") {
      throw new Error("Expected PWA update timeout callback");
    }

    await act(async () => {
      timeoutCallback();
      await Promise.resolve();
    });

    act(() => {
      screen.getByRole("button", { name: "Retry" }).click();
    });

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
