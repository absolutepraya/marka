import { getGlobalOptions } from "@/lib/globals";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { normalizeServerAddress } from "./config";

import type { AppRouter } from "@karakeep/trpc/routers/_app";
import { TRPC_MAX_URL_LENGTH_INTERNAL } from "@karakeep/shared/trpc";

export function getAPIClient() {
  const globals = getGlobalOptions();
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${normalizeServerAddress(globals.serverAddr)}/api/trpc`,
        maxURLLength: TRPC_MAX_URL_LENGTH_INTERNAL,
        transformer: superjson,
        headers() {
          return {
            authorization: `Bearer ${globals.apiKey}`,
          };
        },
      }),
    ],
  });
}

export function getAPIClientFor(opts: { serverAddr: string; apiKey: string }) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${normalizeServerAddress(opts.serverAddr)}/api/trpc`,
        maxURLLength: TRPC_MAX_URL_LENGTH_INTERNAL,
        transformer: superjson,
        headers() {
          return {
            authorization: `Bearer ${opts.apiKey}`,
          };
        },
      }),
    ],
  });
}
