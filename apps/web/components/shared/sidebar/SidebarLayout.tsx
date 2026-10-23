import React, { Suspense } from "react";
import ErrorFallback from "@/components/dashboard/ErrorFallback";
import Header from "@/components/dashboard/header/Header";
import DemoModeBanner from "@/components/DemoModeBanner";
import { MarkaStackLoader } from "@/components/loading-ui/marka-stack";
import ValidAccountCheck from "@/components/utils/ValidAccountCheck";
import { useTranslation as getTranslation } from "@/lib/i18n/server";
import { ErrorBoundary } from "react-error-boundary";

import serverConfig from "@karakeep/shared/config";

export default async function SidebarLayout({
  children,
  mobileSidebar,
  sidebar,
  modal,
}: {
  children: React.ReactNode;
  mobileSidebar: React.ReactNode;
  sidebar: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const { t } = await getTranslation();

  return (
    <div className="sm:fixed sm:inset-0 sm:overflow-hidden">
      <Header />
      <div className="sm:bg-sidebar/95 flex min-h-[calc(100vh-64px)] w-full flex-col sm:h-[calc(100dvh-64px)] sm:flex-row sm:overflow-hidden">
        <ValidAccountCheck />
        <div className="hidden flex-none sm:flex">{sidebar}</div>
        <main className="flex-1 bg-background sm:min-h-0 sm:overflow-y-auto sm:rounded-tl-2xl sm:border-l sm:border-t sm:border-border/70">
          {serverConfig.demoMode && <DemoModeBanner />}
          {modal}
          {/* Reserve the floating nav's height, gesture-safe-area inset, and a
              small visual gap so the last mobile row can scroll clear of it. */}
          <div className="min-h-30 container p-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:p-5 sm:pb-5">
            <ErrorBoundary fallback={<ErrorFallback />}>
              <Suspense
                fallback={
                  <MarkaStackLoader
                    label={t("common.loading")}
                    className="min-h-30"
                  />
                }
              >
                {children}
              </Suspense>
            </ErrorBoundary>
          </div>
          {mobileSidebar}
        </main>
      </div>
    </div>
  );
}
