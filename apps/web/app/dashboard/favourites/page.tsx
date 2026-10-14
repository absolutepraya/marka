import type { Metadata } from "next";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { PageHeader } from "@/components/shared/PageHeader";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("lists.favourites")} | Marka`,
  };
}

export default async function FavouritesBookmarkPage() {
  return (
    <Bookmarks
      header={
        <PageHeader
          title="⭐️ Favourites"
          titleAction={<GlobalActions />}
          className="flex-wrap"
        />
      }
      query={{ favourited: true }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
