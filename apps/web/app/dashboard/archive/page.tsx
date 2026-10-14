import type { Metadata } from "next";
import GlobalActions from "@/components/dashboard/GlobalActions";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslation } from "@/lib/i18n/server";
import { Archive } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.archive")} | Marka`,
  };
}

export default async function ArchivedBookmarkPage() {
  return (
    <Bookmarks
      header={
        <PageHeader
          title="Archive"
          icon={<Archive />}
          titleAction={<GlobalActions />}
          className="flex-wrap"
        />
      }
      query={{ archived: true }}
      showDivider={true}
      showEditorCard={true}
      deferInitialFetch
    />
  );
}
