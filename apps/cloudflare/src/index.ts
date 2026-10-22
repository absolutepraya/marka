export { LibraryStoreObject } from "./libraryStore/libraryStoreObject";

// The API and web app are mounted in later steps of the Cloudflare target.
export default {
  fetch() {
    return new Response("Not implemented", { status: 501 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
