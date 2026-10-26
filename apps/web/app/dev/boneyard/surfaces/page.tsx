import { notFound } from "next/navigation";
import SurfacePreview from "./SurfacePreview";

export default async function SurfacePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string; state?: string; surface?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return (
    <div className="min-h-screen bg-background sm:pl-64">
      <div className="container p-4 sm:p-5">
        <SurfacePreview
          capture={params.capture === "1"}
          state={params.state}
          surface={params.surface}
        />
      </div>
    </div>
  );
}
