import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getSupportedMimeTypes } from "@karakeep/shared/content-support";

import { Asset } from "@karakeep/trpc/models/assets";

import { apiKeyScopeMiddleware } from "../middlewares/apiKeyScopes";
import { authMiddleware } from "../middlewares/auth";
import { createRateLimitMiddleware } from "../middlewares/rateLimit";
import { serveAsset } from "../utils/assets";
import { uploadAsset } from "../utils/upload";

const app = new Hono()
  .use(authMiddleware)
  .post(
    "/restore",
    apiKeyScopeMiddleware("assets", "readwrite"),
    apiKeyScopeMiddleware("bookmarks", "readwrite"),
    createRateLimitMiddleware({
      name: "assets.restore",
      windowMs: 60 * 1000,
      maxRequests: 300,
    }),
    zValidator("form", z.object({ file: z.instanceof(File) })),
    async (c) => {
      // Uploaded files remain unattached until the owner-only import validates
      // their destination bookmark, transcript, MIME, and attachment role.
      const up = await uploadAsset(
        c.var.ctx.user,
        c.var.ctx.db,
        c.req.valid("form"),
        getSupportedMimeTypes("rawDownload"),
      );
      if ("error" in up) return c.json({ error: up.error }, up.status);
      return c.json(up);
    },
  )
  .post(
    "/",
    apiKeyScopeMiddleware("assets", "readwrite"),
    createRateLimitMiddleware({
      name: "assets.upload",
      windowMs: 60 * 1000,
      maxRequests: 30,
    }),
    zValidator(
      "form",
      z
        .object({ file: z.instanceof(File) })
        .or(z.object({ image: z.instanceof(File) })),
    ),
    async (c) => {
      const body = c.req.valid("form");
      const up = await uploadAsset(c.var.ctx.user, c.var.ctx.db, body);
      if ("error" in up) {
        return c.json({ error: up.error }, up.status);
      }
      return c.json({
        assetId: up.assetId,
        contentType: up.contentType,
        size: up.size,
        fileName: up.fileName,
      });
    },
  )
  .get("/:assetId", apiKeyScopeMiddleware("assets", "read"), async (c) => {
    const assetId = c.req.param("assetId");

    const asset = await Asset.fromId(c.var.ctx, assetId);
    await asset.ensureCanView();

    return await serveAsset(c, assetId, asset.asset.userId);
  });

export default app;
