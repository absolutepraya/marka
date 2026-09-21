import type { Metadata } from "next";
import { ChangePassword } from "@/components/settings/ChangePassword";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import ReaderSettings from "@/components/settings/ReaderSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import UserAvatar from "@/components/settings/UserAvatar";
import UserDetails from "@/components/settings/UserDetails";
import UserOptions from "@/components/settings/UserOptions";
import { useTranslation } from "@/lib/i18n/server";
import { User } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("settings.info.user_info")} | Marka`,
  };
}

export default async function InfoPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <SettingsPage
      title={t("settings.info.user_info")}
      description={t("settings.info.page_description")}
      icon={<User className="size-6 shrink-0 text-muted-foreground" />}
    >
      <UserAvatar />
      <UserDetails />
      <ChangePassword />
      <UserOptions />
      <ReaderSettings />
      <DeleteAccount />
    </SettingsPage>
  );
}
