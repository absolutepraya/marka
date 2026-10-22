import { DurableObject } from "cloudflare:workers";

import type { LibraryStore } from "@karakeep/db/libraryStore";
import { bindLibraryStore } from "@karakeep/db/libraryStore";

import { createDurableSqliteStore } from "./durableSqliteStore";
import { handleRemoteStoreRequest } from "./remoteEndpoint";

/** Path of the remote library store endpoint used by Container jobs. */
export const REMOTE_STORE_PATH = "/library-store";

/**
 * Holds the installation's library store. ADR 0011: one instance per
 * installation, which will also run the API so transactions stay local.
 */
export class LibraryStoreObject extends DurableObject<Cloudflare.Env> {
  readonly store: LibraryStore;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.store = createDurableSqliteStore(ctx.storage);
    // One store per installation, so code in this isolate can use `db`.
    bindLibraryStore(this.store);
    void ctx.blockConcurrencyWhile(async () => {
      await this.store.migrate();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === REMOTE_STORE_PATH) {
      return handleRemoteStoreRequest(
        request,
        this.ctx.storage,
        this.env.LIBRARY_STORE_SECRET,
      );
    }
    return new Response("Not found", { status: 404 });
  }
}
