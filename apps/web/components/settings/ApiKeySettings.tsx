import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import RelativeTime from "@/components/ui/relative-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { KeyRound } from "lucide-react";

import AddApiKey from "./AddApiKey";

import DeleteApiKey from "./DeleteApiKey";
import RegenerateApiKey from "./RegenerateApiKey";
import { SettingsSection } from "./SettingsPage";
import { isAdminScope, scopeLabel } from "./apiKeyScopes";

export default async function ApiKeys({ isAdmin }: { isAdmin: boolean }) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const keys = await api.apiKeys.list();

  return (
    <SettingsSection
      title="Active keys"
      description="Manage existing credentials, review their scopes, and rotate anything that has outlived its trust window."
      action={<AddApiKey isAdmin={isAdmin} />}
    >
      {keys.keys.length === 0 ? (
        <EmptyState
          compact
          icon={<KeyRound className="size-6" />}
          title="No API keys yet"
          description="Create your first key to connect scripts, automations, or integrations to your account."
          className="bg-background/70"
        />
      ) : (
        <div className="shadow-xs overflow-hidden rounded-xl border border-border/70 bg-background/80">
          <Table className="whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3 [&_th]:py-2">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("common.key")}</TableHead>
                <TableHead>{t("settings.api_keys.scopes.scopes")}</TableHead>
                <TableHead>{t("common.created_at")}</TableHead>
                <TableHead>{t("common.last_used")}</TableHead>
                <TableHead>{t("common.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.keys.map((key) => {
                const visibleScopes = key.scopes.filter(
                  (scope) => isAdmin || !isAdminScope(scope),
                );
                return (
                  <TableRow key={key.id} className="h-12">
                    <TableCell className="font-medium text-foreground">
                      {key.name}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      **_{key.keyId}_**
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-80 flex-nowrap gap-1.5 overflow-x-auto">
                        {visibleScopes.map((scope) => (
                          <Badge
                            key={scope}
                            variant="outline"
                            className="shrink-0 border-border/70 bg-background/70 text-muted-foreground"
                          >
                            {scopeLabel(t, scope)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RelativeTime date={key.createdAt} />
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt ? (
                        <RelativeTime date={key.lastUsedAt} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <RegenerateApiKey name={key.name} id={key.id} />
                        <DeleteApiKey name={key.name} id={key.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SettingsSection>
  );
}
