import React from "react";
import GlobalActions from "@/components/dashboard/GlobalActions";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslation } from "@/lib/i18n/server";
import { Home } from "lucide-react";

export default async function BookmarksPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <Bookmarks
      header={
        <PageHeader
          title={t("common.home")}
          icon={<Home />}
          titleAction={<GlobalActions />}
          className="flex-wrap"
        />
      }
      query={{ archived: false }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
