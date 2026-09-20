// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ServiceWorkerRegistration, {
  usePwaLifecycle,
} from "./ServiceWorkerRegistration";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  getRegistration: vi.fn(),
  getRegistrations: vi.fn(),
  fetch: vi.fn(),
  messagePort: { postMessage: vi.fn() },
  waitingWorker: {
    postMessage: vi.fn(),
    scriptURL: "https://karakeep.test/sw.js",
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

function installServiceWorkerMock() {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      addEventListener: mocks.addEventListener,
      controller: mocks.messagePort,
      getRegistration: mocks.getRegistration,
      getRegistrations: mocks.getRegistrations,
      register: mocks.register,
      removeEventListener: mocks.removeEventListener,
    },
  });
}

function renderRegistration(children?: React.ReactNode) {
  const Provider = ServiceWorkerRegistration as React.ComponentType<{
    children?: React.ReactNode;
  }>;
  return render(<Provider>{children}</Provider>);
}

function getServiceWorkerListener(type: string) {
  const call = mocks.addEventListener.mock.calls.find(
    ([eventType]) => eventType === type,
  );
  if (!call) {
    throw new Error(`Missing service worker listener for ${type}`);
  }
  return call[1] as () => void;
}

describe("ServiceWorkerRegistration", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    installServiceWorkerMock();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.getRegistration.mockResolvedValue(undefined);
    mocks.getRegistrations.mockResolvedValue([]);
    mocks.register.mockResolvedValue({ active: mocks.messagePort });
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ version: "development" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    cleanup();
    mocks.register.mockReset();
    mocks.getRegistration.mockReset();
    mocks.getRegistrations.mockReset();
    mocks.fetch.mockReset();
    mocks.messagePort.postMessage.mockReset();
    mocks.waitingWorker.postMessage.mockReset();
    mocks.addEventListener.mockReset();
    mocks.removeEventListener.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not register a service worker during development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const unregister = vi.fn().mockResolvedValue(true);
    mocks.getRegistrations.mockResolvedValue([{ unregister }]);
    Object.defineProperty(navigator.serviceWorker, "controller", {
      configurable: true,
      value: null,
    });

    renderRegistration();

    await waitFor(() => {
      expect(mocks.getRegistrations).toHaveBeenCalled();
      expect(unregister).toHaveBeenCalledOnce();
    });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("registers the worker without caching updates and clears user caches when unauthenticated", async () => {
    renderRegistration();

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    });

    await waitFor(() => {
      expect(mocks.messagePort.postMessage).toHaveBeenCalledWith({
        type: "CLEAR_USER_CACHES",
      });
    });
  });

  it("checks the live deployed build without HTTP cache and registers a newer worker", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    renderRegistration();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/version",
        expect.objectContaining({
          cache: "no-store",
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith("/sw.js?v=bbbbbbb", {
        scope: "/",
        updateViaCache: "none",
      });
    });
  });

  it("prefers the full commit field over the legacy version field", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: "ccccccc",
          commit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    renderRegistration();

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith(
        "/sw.js?v=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        {
          scope: "/",
          updateViaCache: "none",
        },
      );
    });
  });

  it("refreshes the registered worker during a manual version check", async () => {
    const initialUpdate = vi.fn().mockResolvedValue(undefined);
    const registeredUpdate = vi.fn().mockResolvedValue(undefined);
    mocks.register.mockResolvedValueOnce({
      active: mocks.messagePort,
      update: initialUpdate,
    });
    mocks.register.mockResolvedValueOnce({
      active: mocks.messagePort,
      update: registeredUpdate,
    });
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    function Probe() {
      const { checkForUpdate } = usePwaLifecycle();
      return <button onClick={() => void checkForUpdate()}>Check</button>;
    }

    renderRegistration(<Probe />);
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.getRegistration).toHaveBeenCalledWith("/");
      expect(initialUpdate).toHaveBeenCalled();
      expect(registeredUpdate).toHaveBeenCalled();
    });
    registeredUpdate.mockClear();
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    act(() => screen.getByRole("button", { name: "Check" }).click());

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(registeredUpdate).toHaveBeenCalledTimes(1));
  });

  it("keeps a pre-existing waiting worker ready for manual activation", async () => {
    mocks.getRegistration.mockResolvedValue({
      active: mocks.messagePort,
      waiting: mocks.waitingWorker,
    });

    renderRegistration();

    await waitFor(() => {
      expect(mocks.getRegistration).toHaveBeenCalledWith("/");
    });
    await waitFor(() =>
      expect(mocks.getRegistration).toHaveBeenCalledWith("/"),
    );
    expect(mocks.waitingWorker.postMessage).not.toHaveBeenCalled();
  });

  it("does not activate a stale waiting worker and registers the running app build instead", async () => {
    const staleWaitingWorker = {
      postMessage: vi.fn(),
      scriptURL: "https://karakeep.test/sw.js?v=bbbbbbb",
    };
    mocks.getRegistration.mockResolvedValue({
      active: mocks.messagePort,
      waiting: staleWaitingWorker,
    });

    renderRegistration();

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    });
    expect(staleWaitingWorker.postMessage).not.toHaveBeenCalledWith({
      type: "ACTIVATE_UPDATE",
    });
  });

  it("reloads exactly once after a manual waiting-worker handoff", async () => {
    const go = vi
      .spyOn(window.history, "go")
      .mockImplementation(() => undefined);
    const currentWorker = {
      ...mocks.messagePort,
      scriptURL: "https://karakeep.test/sw.js",
    };
    mocks.getRegistration.mockResolvedValue({
      active: currentWorker,
      waiting: mocks.waitingWorker,
    });
    mocks.register
      .mockResolvedValueOnce({ active: currentWorker })
      .mockResolvedValueOnce({
        active: currentWorker,
        waiting: mocks.waitingWorker,
      });
    mocks.waitingWorker.scriptURL = "https://karakeep.test/sw.js?v=bbbbbbb";
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    function Probe() {
      const { activateUpdate } = usePwaLifecycle();
      return <button onClick={activateUpdate}>Update</button>;
    }

    renderRegistration(<Probe />);
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(2));
    act(() => screen.getByRole("button", { name: "Update" }).click());
    expect(mocks.waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "ACTIVATE_UPDATE",
    });

    const controllerChange = getServiceWorkerListener("controllerchange");
    act(() => {
      controllerChange();
      controllerChange();
    });

    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(0);
  });

  it("does not reload for an ordinary controller change without an update handoff", async () => {
    const go = vi
      .spyOn(window.history, "go")
      .mockImplementation(() => undefined);

    renderRegistration();
    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalled();
    });

    act(() => {
      getServiceWorkerListener("controllerchange")();
    });

    expect(go).not.toHaveBeenCalled();
  });

  it("checks again when an existing document returns to the foreground", async () => {
    renderRegistration();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
    mocks.fetch.mockClear();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/version",
        expect.objectContaining({
          cache: "no-store",
          signal: expect.any(AbortSignal),
        }),
      );
    });
  });

  it("cleans up an installing worker state handler when the provider unmounts", async () => {
    const installingWorker = {
      state: "installing",
      onstatechange: null as (() => void) | null,
      scriptURL: "https://karakeep.test/sw.js?v=bbbbbbb",
    };
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    mocks.register
      .mockResolvedValueOnce({ active: mocks.messagePort })
      .mockResolvedValueOnce({
        active: mocks.messagePort,
        installing: installingWorker,
        waiting: null,
      });

    const rendered = renderRegistration();

    await waitFor(() => {
      expect(installingWorker.onstatechange).toEqual(expect.any(Function));
    });

    rendered.unmount();

    expect(installingWorker.onstatechange).toBeNull();
  });

  it("does not mark a later deployed worker ready because the previous deploy is waiting", async () => {
    const registrationModule = await import("./ServiceWorkerRegistration");
    const usePwaLifecycle = (
      registrationModule as typeof registrationModule & {
        usePwaLifecycle: () => {
          appBuild: string;
          deployedBuild: string | null;
          updateStatus: string;
        };
      }
    ).usePwaLifecycle;

    function Probe() {
      const state = usePwaLifecycle();
      return <span data-testid="update-status">{state.updateStatus}</span>;
    }

    const waitingBuildB = {
      postMessage: vi.fn(),
      scriptURL: "https://karakeep.test/sw.js?v=bbbbbbb",
    };
    const installingBuildC = {
      state: "installing",
      onstatechange: null as (() => void) | null,
      scriptURL: "https://karakeep.test/sw.js?v=ccccccc",
    };
    const buildBRegistration = {
      active: mocks.messagePort,
      waiting: waitingBuildB as unknown as ServiceWorker,
    };
    const buildCRegistration = {
      active: mocks.messagePort,
      installing: installingBuildC as unknown as ServiceWorker,
      waiting: waitingBuildB as unknown as ServiceWorker,
    };

    mocks.fetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: "bbbbbbb" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: "ccccccc" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    mocks.register
      .mockResolvedValueOnce({ active: mocks.messagePort })
      .mockResolvedValueOnce(buildBRegistration)
      .mockResolvedValueOnce(buildCRegistration);

    renderRegistration(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId("update-status").textContent).toBe("ready");
    });

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalledWith("/sw.js?v=ccccccc", {
        scope: "/",
        updateViaCache: "none",
      });
      expect(screen.getByTestId("update-status").textContent).toBe(
        "installing",
      );
      expect(installingBuildC.onstatechange).toEqual(expect.any(Function));
    });

    buildCRegistration.waiting = installingBuildC as unknown as ServiceWorker;
    installingBuildC.state = "installed";
    act(() => {
      installingBuildC.onstatechange?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("update-status").textContent).toBe("ready");
    });
  });

  it("provides shared running-build and deployed-update state to descendants", async () => {
    const registrationModule = await import("./ServiceWorkerRegistration");
    expect(registrationModule).toHaveProperty("usePwaLifecycle");

    const usePwaLifecycle = (
      registrationModule as typeof registrationModule & {
        usePwaLifecycle: () => {
          appBuild: string;
          deployedBuild: string | null;
          updateStatus: string;
        };
      }
    ).usePwaLifecycle;

    function Probe() {
      const state = usePwaLifecycle();
      return (
        <div>
          <span data-testid="app-build">{state.appBuild}</span>
          <span data-testid="deployed-build">{state.deployedBuild}</span>
          <span data-testid="update-status">{state.updateStatus}</span>
        </div>
      );
    }

    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "bbbbbbb" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const waitingBuildB = {
      ...mocks.waitingWorker,
      scriptURL: "https://karakeep.test/sw.js?v=bbbbbbb",
    };
    mocks.register
      .mockResolvedValueOnce({ active: mocks.messagePort })
      .mockResolvedValueOnce({
        active: mocks.messagePort,
        waiting: waitingBuildB,
      });

    renderRegistration(<Probe />);

    expect(screen.getByTestId("app-build").textContent).toBe("development");
    await waitFor(() => {
      expect(screen.getByTestId("deployed-build").textContent).toBe("bbbbbbb");
      expect(screen.getByTestId("update-status").textContent).toBe("ready");
    });
  });
});
