import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/settings/SettingsPage";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";
import { QuotaProgress } from "@/components/subscription/QuotaProgress";
import { MARKA } from "@/lib/brand";
import { useTranslation } from "@/lib/i18n/server";
import { CreditCard } from "lucide-react";

import serverConfig from "@karakeep/shared/config";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.subscription.subscription")} | ${MARKA.name}`,
  };
}

export default async function SubscriptionPage() {
  if (!serverConfig.stripe.isConfigured) {
    redirect("/settings");
  }

  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <SettingsPage
      title={t("settings.subscription.subscription")}
      description={t("settings.subscription.page_description")}
      icon={<CreditCard className="size-6 shrink-0 text-muted-foreground" />}
    >
      <SubscriptionSettings />
      <QuotaProgress />
    </SettingsPage>
  );
}
