import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { printMetrics } from "./metrics";

export function createWorkerApp() {
  let ready = false;
  const app = new Hono()
    .get("/health", (c) =>
      c.json({ status: "ok", timestamp: new Date().toISOString() }),
    )
    .get("/ready", (c) =>
      c.json({ status: ready ? "ready" : "starting" }, ready ? 200 : 503),
    )
    .get(
      "/metrics",
      bearerAuth({ token: serverConfig.prometheus.metricsToken }),
      printMetrics,
    );
  return {
    app,
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}

export function buildServer() {
  const { app, setReady } = createWorkerApp();
  const server = serve(
    {
      fetch: app.fetch,
      port: serverConfig.workers.port,
      hostname: serverConfig.workers.host,
    },
    (info) => {
      logger.info(`Listening on http://${info.address}:${info.port}`);
    },
  );
  return {
    _server: server,
    setReady,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        setReady(false);
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
    serve: () =>
      new Promise<void>((resolve, reject) => {
        server.on("error", reject);
        server.on("close", () => resolve());
      }),
  };
}
