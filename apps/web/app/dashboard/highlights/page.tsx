import type { Metadata } from "next";
import { Suspense } from "react";
import AllHighlights from "@/components/dashboard/highlights/AllHighlights";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/highlights.bones.json";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { Highlighter, Search } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.highlights")} | Marka`,
  };
}

async function HighlightsResults() {
  const highlights = await api.highlights.getAll({});
  return <AllHighlights highlights={highlights} />;
}

export default async function HighlightsPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("common.highlights")} icon={<Highlighter />} />
      <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-5">
        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              <Input
                disabled
                placeholder="Search highlights..."
                aria-label={t("search.placeholder")}
                startIcon={<Search className="size-4 text-muted-foreground" />}
              />
              <CapturedSkeleton name="highlights" bones={bones} />
            </div>
          }
        >
          <HighlightsResults />
        </Suspense>
      </div>
    </div>
  );
}
