"use client";

import type { ReactNode } from "react";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "@/lib/auth/client";
import { recordThumbnailAccess } from "@/lib/offline-library/repository";

import { normalizeCommitSha } from "@karakeep/shared/version";

type WorkerMessage =
  | { type: "ACTIVATE_UPDATE" }
  | { type: "UPDATE_ACTIVATION_BLOCKED" }
  | { type: "CLEAR_USER_CACHES" }
  | { type: "SET_DOCUMENT_CACHE_SESSION"; sessionId: string | null }
  | { type: "THUMBNAIL_USED"; url: string };

export type PwaUpdateStatus =
  | "current"
  | "checking"
  | "available"
  | "installing"
  | "ready"
  | "blocked"
  | "error"
  | "updating"
  | "unavailable";

export interface PwaLifecycleState {
  appBuild: string;
  deployedBuild: string | null;
  updateStatus: PwaUpdateStatus;
  updateAvailable: boolean;
  checkForUpdate: () => Promise<void>;
  activateUpdate: () => void;
}

const compiledServiceWorkerBuildVersion =
  process.env.NEXT_PUBLIC_SERVICE_WORKER_BUILD_VERSION;
const appBuild = compiledServiceWorkerBuildVersion ?? "development";
const serviceWorkerUrl = compiledServiceWorkerBuildVersion
  ? `/sw.js?v=${encodeURIComponent(compiledServiceWorkerBuildVersion)}`
  : "/sw.js";
const developmentResetKey = "marka-dev-service-worker-reset";

const PwaLifecycleContext = createContext<PwaLifecycleState>({
  appBuild,
  deployedBuild: null,
  updateStatus: "current",
  updateAvailable: false,
  checkForUpdate: async () => undefined,
  activateUpdate: () => undefined,
});

export function usePwaLifecycle() {
  return useContext(PwaLifecycleContext);
}

function isDeployBuild(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value);
}

function isValidBuild(value: string) {
  return (
    isDeployBuild(value) ||
    (value === "development" && process.env.NODE_ENV !== "production")
  );
}

function isWorkerForBuild(
  worker: ServiceWorker | null | undefined,
  build: string,
) {
  if (!worker?.scriptURL) {
    return false;
  }

  try {
    const workerUrl = new URL(worker.scriptURL);
    return (
      workerUrl.pathname.endsWith("/sw.js") &&
      (workerUrl.searchParams.get("v") ?? "development") === build
    );
  } catch {
    return false;
  }
}

export default function ServiceWorkerRegistration({
  children,
}: {
  children?: ReactNode;
}) {
  const { data: session, status } = useSession();
  const [deployedBuild, setDeployedBuild] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<PwaUpdateStatus>("current");
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const sessionStatusRef = useRef(status);
  const sessionIdRef = useRef(session?.user?.id ?? null);
  const hasClearedUserCachesRef = useRef(false);
  const checkPromiseRef = useRef<Promise<void> | null>(null);
  const checkForUpdateRef = useRef<(() => Promise<void>) | null>(null);
  const handoffArmedRef = useRef(false);
  const handoffReloadedRef = useRef(false);
  const updateAvailable =
    isValidBuild(appBuild) &&
    deployedBuild !== null &&
    isValidBuild(deployedBuild) &&
    deployedBuild !== appBuild;

  const activateUpdate = () => {
    const waitingWorker = registrationRef.current?.waiting;
    if (
      !waitingWorker ||
      !deployedBuild ||
      !isWorkerForBuild(waitingWorker, deployedBuild)
    ) {
      setUpdateStatus("checking");
      void checkForUpdateRef.current?.();
      return;
    }

    setUpdateStatus("updating");
    handoffArmedRef.current = true;
    waitingWorker.postMessage({
      type: "ACTIVATE_UPDATE",
    } satisfies WorkerMessage);
  };

  useEffect(() => {
    sessionStatusRef.current = status;
    sessionIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id, status]);

  const clearUserCaches = () => {
    if (hasClearedUserCachesRef.current || !("serviceWorker" in navigator)) {
      return;
    }

    const worker =
      registrationRef.current?.active ?? navigator.serviceWorker.controller;
    if (!worker) {
      return;
    }

    worker.postMessage({ type: "CLEAR_USER_CACHES" } satisfies WorkerMessage);
    hasClearedUserCachesRef.current = true;
  };

  const syncDocumentCacheSession = () => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const worker =
      registrationRef.current?.active ?? navigator.serviceWorker.controller;
    worker?.postMessage({
      type: "SET_DOCUMENT_CACHE_SESSION",
      sessionId: sessionIdRef.current,
    } satisfies WorkerMessage);
  };

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      const hadController = Boolean(navigator.serviceWorker.controller);
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );

        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(
            cacheNames.map((cacheName) => window.caches.delete(cacheName)),
          );
        }

        const hasResetThisSession =
          window.sessionStorage.getItem(developmentResetKey) === "1";
        if (hadController && !hasResetThisSession) {
          window.sessionStorage.setItem(developmentResetKey, "1");
          window.location.reload();
        } else if (!hadController) {
          window.sessionStorage.removeItem(developmentResetKey);
        }
      })();
      return;
    }

    let installingWorker: ServiceWorker | null = null;

    const receiveWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data?.type === "UPDATE_ACTIVATION_BLOCKED") {
        handoffArmedRef.current = false;
        setUpdateStatus("blocked");
        return;
      }
      if (
        event.data?.type === "THUMBNAIL_USED" &&
        typeof event.data.url === "string"
      ) {
        void recordThumbnailAccess(event.data.url).catch(() => undefined);
      }
    };

    const handleControllerChange = () => {
      syncDocumentCacheSession();
      if (sessionStatusRef.current === "unauthenticated") {
        clearUserCaches();
      }

      if (handoffArmedRef.current && !handoffReloadedRef.current) {
        handoffReloadedRef.current = true;
        window.history.go(0);
      }
    };

    const watchInstallingWorker = (
      registration: ServiceWorkerRegistration,
      installing: ServiceWorker,
      targetBuild: string,
    ) => {
      const markReadyIfWaiting = () => {
        if (
          installing.state !== "installed" ||
          !isWorkerForBuild(registration.waiting, targetBuild)
        ) {
          return;
        }

        setUpdateStatus("ready");
        installing.onstatechange = null;
        if (installingWorker === installing) {
          installingWorker = null;
        }
      };

      if (installingWorker) {
        installingWorker.onstatechange = null;
      }

      installingWorker = installing;
      setUpdateStatus("installing");
      installing.onstatechange = markReadyIfWaiting;
      markReadyIfWaiting();
    };

    const runUpdateCheck = async () => {
      setUpdateStatus("checking");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setUpdateStatus("error");
          return;
        }

        const body = (await response.json()) as {
          version?: unknown;
          commit?: unknown;
        };
        const deployedVersion =
          normalizeCommitSha(body.commit) ?? normalizeCommitSha(body.version);
        if (!isValidBuild(appBuild) || !isDeployBuild(deployedVersion)) {
          setUpdateStatus("unavailable");
          return;
        }

        setDeployedBuild(deployedVersion);
        if (
          registrationRef.current &&
          typeof registrationRef.current.update === "function"
        ) {
          await registrationRef.current.update().catch(() => undefined);
        }
        if (deployedVersion === appBuild) {
          setUpdateStatus("current");
          return;
        }

        setUpdateStatus("available");
        const registration = await navigator.serviceWorker.register(
          `/sw.js?v=${encodeURIComponent(deployedVersion)}`,
          {
            scope: "/",
            updateViaCache: "none",
          },
        );
        registrationRef.current = registration;
        if (typeof registration.update === "function") {
          await registration.update().catch(() => undefined);
        }

        if (isWorkerForBuild(registration.waiting, deployedVersion)) {
          setUpdateStatus("ready");
          return;
        }

        if (
          registration.installing &&
          isWorkerForBuild(registration.installing, deployedVersion)
        ) {
          watchInstallingWorker(
            registration,
            registration.installing,
            deployedVersion,
          );
        } else {
          setUpdateStatus("available");
        }
      } catch {
        setUpdateStatus("error");
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const checkForUpdate = () => {
      if (checkPromiseRef.current) {
        return checkPromiseRef.current;
      }

      const promise = runUpdateCheck().finally(() => {
        if (checkPromiseRef.current === promise) {
          checkPromiseRef.current = null;
        }
      });
      checkPromiseRef.current = promise;
      return promise;
    };
    checkForUpdateRef.current = checkForUpdate;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };

    navigator.serviceWorker.addEventListener("message", receiveWorkerMessage);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      try {
        const existingRegistration =
          await navigator.serviceWorker.getRegistration("/");
        let registration = existingRegistration;
        const waitingMatchesCurrent = isWorkerForBuild(
          existingRegistration?.waiting,
          appBuild,
        );
        const installingMatchesCurrent = isWorkerForBuild(
          existingRegistration?.installing,
          appBuild,
        );
        const activeMatchesCurrent = isWorkerForBuild(
          existingRegistration?.active,
          appBuild,
        );
        const hasStalePendingWorker = Boolean(
          (existingRegistration?.waiting && !waitingMatchesCurrent) ||
          (existingRegistration?.installing && !installingMatchesCurrent),
        );

        if (waitingMatchesCurrent && existingRegistration?.waiting) {
          setUpdateStatus("ready");
        }

        if (
          !registration ||
          hasStalePendingWorker ||
          (!waitingMatchesCurrent &&
            !installingMatchesCurrent &&
            !activeMatchesCurrent)
        ) {
          registration = await navigator.serviceWorker.register(
            serviceWorkerUrl,
            {
              scope: "/",
              updateViaCache: "none",
            },
          );
        }

        registrationRef.current = registration;
        syncDocumentCacheSession();
        if (sessionStatusRef.current === "unauthenticated") {
          clearUserCaches();
        }

        await checkForUpdate();
      } catch {
        // Service-worker registration is best-effort in unsupported/broken clients.
      }
    })();

    return () => {
      if (installingWorker) {
        installingWorker.onstatechange = null;
      }
      navigator.serviceWorker.removeEventListener(
        "message",
        receiveWorkerMessage,
      );
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      checkForUpdateRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncDocumentCacheSession();

    if (status === "authenticated") {
      hasClearedUserCachesRef.current = false;
      return;
    }

    if (status === "unauthenticated") {
      clearUserCaches();
    }
  }, [session?.user?.id, status]);

  return (
    <PwaLifecycleContext.Provider
      value={{
        appBuild,
        deployedBuild,
        updateStatus,
        updateAvailable,
        checkForUpdate: async () => {
          await checkForUpdateRef.current?.();
        },
        activateUpdate,
      }}
    >
      {children}
    </PwaLifecycleContext.Provider>
  );
}
