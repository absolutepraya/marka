import { notFound } from "next/navigation";
import { AdminCard } from "@/components/admin/AdminCard";
import { BasicStatsFixture } from "@/components/admin/BasicStatsContent";
import BasicStatsSkeleton from "@/components/admin/BasicStatsSkeleton";

export default async function BoneyardPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { state } = await searchParams;

  return (
    <div className="min-h-screen bg-background sm:pl-64">
      {/* Match the admin sidebar and content padding at capture widths. */}
      <div className="container p-4 sm:p-5">
        <div className="mx-auto w-full max-w-7xl">
          <AdminCard>
            {state === "loaded" ? (
              <BasicStatsFixture />
            ) : (
              <BasicStatsSkeleton />
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
