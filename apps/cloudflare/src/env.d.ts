import type { LibraryStoreObject } from "./libraryStore/libraryStoreObject";

declare global {
  namespace Cloudflare {
    interface Env {
      LIBRARY_STORE: DurableObjectNamespace<LibraryStoreObject>;
    }
  }
}

export {};
