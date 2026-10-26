"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { AdminCard } from "@/components/admin/AdminCard";
import { Badge } from "@/components/ui/badge";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/admin-connections.bones.json";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

function ConnectionStatus({
  label,
  configured,
  connected,
  pluginName,
  error,
}: {
  label: string;
  configured: boolean;
  connected: boolean;
  pluginName?: string;
  error?: string;
}) {
  const { t } = useTranslation();

  let statusText = t("admin.service_connections.status.not_configured");
  let tone = "border-border/70 bg-background/80 text-muted-foreground";

  if (configured) {
    if (connected) {
      statusText = t("admin.service_connections.status.connected");
      tone = "border-success/20 bg-success/10 text-success";
    } else {
      statusText = t("admin.service_connections.status.disconnected");
      tone = "border-destructive/20 bg-destructive/10 text-destructive";
    }
  }

  return (
    <div className="shadow-xs rounded-xl border border-border/70 bg-background/80 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          {pluginName && (
            <div className="mt-1 text-xs text-muted-foreground">
              {pluginName}
            </div>
          )}
        </div>
        <div
          className={cn(
            "mt-1 size-2 rounded-full",
            configured && connected
              ? "bg-success"
              : configured
                ? "bg-destructive"
                : "bg-muted-foreground/40",
          )}
        />
      </div>
      <Badge variant="secondary" className={cn("border", tone)}>
        {statusText}
      </Badge>
      {error && (
        <div className="mt-3 rounded-lg border border-destructive/15 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
          <p title={error}>
            {error.length > 80 ? `${error.substring(0, 80)}…` : error}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ServiceConnections() {
  const api = useTRPC();
  const { data: connections } = useQuery(
    api.admin.checkConnections.queryOptions(undefined, {
      refetchInterval: 10000,
    }),
  );

  if (!connections) {
    return <CapturedSkeleton name="admin-connections" bones={bones} />;
  }

  return <ConnectionsContent connections={connections} />;
}

export function ConnectionsContent({
  connections,
}: {
  connections: inferRouterOutputs<AppRouter>["admin"]["checkConnections"];
}) {
  const { t } = useTranslation();
  return (
    <AdminCard>
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {t("admin.service_connections.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("admin.service_connections.description")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ConnectionStatus
          label={t("admin.service_connections.search_engine")}
          configured={connections.searchEngine.configured}
          connected={connections.searchEngine.connected}
          pluginName={connections.searchEngine.pluginName}
          error={connections.searchEngine.error}
        />
        <ConnectionStatus
          label={t("admin.service_connections.browser")}
          configured={connections.browser.configured}
          connected={connections.browser.connected}
          pluginName={connections.browser.pluginName}
          error={connections.browser.error}
        />
        <ConnectionStatus
          label={t("admin.service_connections.queue_system")}
          configured={connections.queue.configured}
          connected={connections.queue.connected}
          pluginName={connections.queue.pluginName}
          error={connections.queue.error}
        />
        <ConnectionStatus
          label={t("admin.service_connections.vector_store")}
          configured={connections.vectorStore.configured}
          connected={connections.vectorStore.connected}
          pluginName={connections.vectorStore.pluginName}
          error={connections.vectorStore.error}
        />
      </div>
    </AdminCard>
  );
}
