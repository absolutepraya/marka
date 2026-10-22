import type { LibraryStoreObject } from "./libraryStore/libraryStoreObject";

declare global {
  namespace Cloudflare {
    interface Env {
      LIBRARY_STORE: DurableObjectNamespace<LibraryStoreObject>;
      /** Shared secret for the remote library store; unset disables it. */
      LIBRARY_STORE_SECRET?: string;
    }
  }
}

export {};
