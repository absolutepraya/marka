"use client";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/import-sessions.bones.json";

import { EmptyState } from "@/components/shared/EmptyState";
import { useListImportSessions } from "@/lib/hooks/useImportSessions";
import { useTranslation } from "@/lib/i18n/client";
import { AlertCircle, Package } from "lucide-react";

import { ImportSessionCard } from "./ImportSessionCard";
import { SettingsSection } from "./SettingsPage";

export function ImportSessionsSection() {
  const { t } = useTranslation();
  const { data: sessions, isLoading, error } = useListImportSessions();

  if (isLoading) {
    return (
      <SettingsSection
        title={t("settings.import_sessions.title")}
        description={t("settings.import_sessions.description")}
      >
        <div>
          <CapturedSkeleton name="import-sessions" bones={bones} />
        </div>
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection
        title={t("settings.import_sessions.title")}
        description={t("settings.import_sessions.description")}
      >
        <EmptyState
          compact
          icon={<AlertCircle className="size-6" />}
          title={t("settings.import_sessions.load_error")}
          description="Try again in a moment. Your existing import runs are still preserved."
          className="border-destructive/20 bg-destructive/[0.03]"
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t("settings.import_sessions.title")}
      description={t("settings.import_sessions.description")}
    >
      {sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => (
            <ImportSessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Package className="size-6" />}
          title={t("settings.import_sessions.no_sessions")}
          description={t("settings.import_sessions.no_sessions_detail")}
          className="bg-background/70"
        />
      )}
    </SettingsSection>
  );
}
