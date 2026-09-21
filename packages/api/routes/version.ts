import { Hono } from "hono";

import serverConfig from "@karakeep/shared/config";
import { createServerVersionResponse } from "@karakeep/shared/version";
import { Context } from "@karakeep/trpc";

const version = new Hono<{
  Variables: {
    ctx: Context;
  };
}>().get("/", (c) => {
  return c.json(
    createServerVersionResponse({
      legacyVersion: serverConfig.serverVersion,
      release: serverConfig.serverRelease,
      commit: serverConfig.serverCommit,
    }),
  );
});

export default version;
