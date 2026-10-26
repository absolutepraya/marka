import { notFound } from "next/navigation";
import { Archive, Home, Highlighter, Search, Tag } from "lucide-react";
import MarkaLogo from "@/components/MarkaLogo";
import HeaderSurface from "@/components/dashboard/header/HeaderSurface";
import Sidebar from "@/components/shared/sidebar/Sidebar";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  defaultUserLocalSettings,
  zUserLocalSettings,
} from "@/lib/userLocalSettings/types";

import BookmarkSkeletonPreview from "./BookmarkSkeletonPreview";

export default async function BookmarkSkeletonPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    capture?: string;
    layout?: string;
    columns?: string;
    state?: string;
  }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const parsed = zUserLocalSettings.safeParse({
    bookmarkGridLayout: params.layout,
    gridColumns: Number(params.columns ?? 3),
  });
  const settings = parsed.success ? parsed.data : defaultUserLocalSettings();
  const content = (
    <BookmarkSkeletonPreview
      settings={settings}
      capture={params.capture === "1"}
      state={params.state}
    />
  );
  if (params.capture === "1") return content;

  return (
    <div className="bg-sidebar/95 min-h-screen">
      <HeaderSurface>
        <div className="flex h-16 items-center gap-3 px-3 sm:px-4">
          <div className="hidden w-60 shrink-0 pl-2 sm:block">
            <MarkaLogo height={30} />
          </div>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 text-sm text-muted-foreground">
            <Search className="size-4" />
            Search bookmarks
          </div>
          <div className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold">
            M
          </div>
        </div>
      </HeaderSurface>
      <div className="flex">
        <div className="hidden shrink-0 sm:block">
          <Sidebar
            items={() => [
              {
                name: "Home",
                icon: <Home size={18} />,
                path: "/dev/boneyard/bookmarks",
              },
              {
                name: "Tags",
                icon: <Tag size={18} />,
                path: "/dashboard/tags",
              },
              {
                name: "Highlights",
                icon: <Highlighter size={18} />,
                path: "/dashboard/highlights",
              },
              {
                name: "Archive",
                icon: <Archive size={18} />,
                path: "/dashboard/archive",
              },
            ]}
          />
        </div>
        <main className="min-w-0 flex-1 bg-background sm:rounded-tl-2xl sm:border-l sm:border-t sm:border-border/70">
          <div className="container min-h-[calc(100vh-64px)] p-4 sm:p-5">
            <PageHeader title="Home" icon={<Home />} />
            <div className="mb-5 mt-4 flex items-center justify-between border-b border-border pb-3 text-sm text-muted-foreground">
              <span>
                {params.state === "offline"
                  ? "Opening offline library…"
                  : params.state === "offline-ready"
                    ? "Offline library"
                    : "All bookmarks"}
              </span>
              <span className="capitalize">
                {settings.bookmarkGridLayout} view
              </span>
            </div>
            {content}
          </div>
        </main>
      </div>
    </div>
  );
}
