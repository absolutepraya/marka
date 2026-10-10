"use client";

import type { UserLocalSettings } from "@/lib/userLocalSettings/types";
import React, { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import VisualViewportSync from "@/components/VisualViewportSync";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import { Session, SessionProvider } from "@/lib/auth/client";
import { UserLocalSettingsCtx } from "@/lib/userLocalSettings/bookmarksLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import type { ClientConfig } from "@karakeep/shared/config";
import type { AppRouter } from "@karakeep/trpc/routers/_app";
import {
  TRPC_MAX_URL_LENGTH_INTERNAL,
  TRPCProvider,
} from "@karakeep/shared-react/trpc";

import { ClientConfigCtx } from "./clientConfig";
import { CaptureComposerProvider } from "./capture-composer";
import CustomI18nextProvider from "./i18n/provider";
import { OfflineLibraryProvider } from "./offline-library/provider";
import { ServerHintsCtx } from "./serverHints";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important so we don't re-make a new client if React
    // supsends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export default function Providers({
  children,
  session,
  clientConfig,
  userLocalSettings,
  isMobile = false,
}: {
  children: React.ReactNode;
  session: Session | null;
  clientConfig: ClientConfig;
  userLocalSettings: UserLocalSettings;
  isMobile?: boolean;
}) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          // TODO: Change this to be a full URL exposed as a client side setting
          url: `/api/trpc`,
          maxURLLength: TRPC_MAX_URL_LENGTH_INTERNAL,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <ClientConfigCtx.Provider value={clientConfig}>
      <VisualViewportSync />
      <ServerHintsCtx.Provider value={{ isMobile }}>
        <UserLocalSettingsCtx.Provider value={userLocalSettings}>
          <SessionProvider session={session}>
            <ServiceWorkerRegistration>
              <QueryClientProvider client={queryClient}>
                <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                  <OfflineLibraryProvider trpcClient={trpcClient}>
                    <CustomI18nextProvider lang={userLocalSettings.lang}>
                      <ThemeProvider
                        attribute="class"
                        defaultTheme="system"
                        enableSystem
                        disableTransitionOnChange
                      >
                        <TooltipProvider
                          delayDuration={450}
                          skipDelayDuration={200}
                        >
                          <CaptureComposerProvider>
                            {children}
                          </CaptureComposerProvider>
                        </TooltipProvider>
                      </ThemeProvider>
                    </CustomI18nextProvider>
                  </OfflineLibraryProvider>
                </TRPCProvider>
              </QueryClientProvider>
            </ServiceWorkerRegistration>
          </SessionProvider>
        </UserLocalSettingsCtx.Provider>
      </ServerHintsCtx.Provider>
    </ClientConfigCtx.Provider>
  );
}
