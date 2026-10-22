import { DurableObject } from "cloudflare:workers";

import type { LibraryStore } from "@karakeep/db/libraryStore";
import { bindLibraryStore } from "@karakeep/db/libraryStore";

import { createDurableSqliteStore } from "./durableSqliteStore";

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
}
