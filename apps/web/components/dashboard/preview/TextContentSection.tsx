import Image from "next/image";
import Link from "next/link";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n/client";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

import type { ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function TextContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.TEXT) {
    throw new Error("Invalid content type");
  }
  const banner = bookmark.assets.find(
    (asset) => asset.assetType == "bannerImage",
  );
  const { t } = useTranslation();

  return (
    <ScrollArea className="reader-text-scroll-area h-full min-w-0 overflow-x-hidden">
      <div className="w-full min-w-0 max-w-full lg:pt-14">
        {banner && (
          <div className="relative h-52 min-w-full">
            <Image
              alt="banner"
              src={getAssetUrl(banner.id)}
              width={0}
              height={0}
              unoptimized
              layout="fill"
              objectFit="cover"
            />
          </div>
        )}
        <div className="mx-auto w-full min-w-0 max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
          <div className="mb-3 flex justify-end lg:hidden">
            <Link
              href={`/reader/${bookmark.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <BookOpen className="mr-2 size-4" aria-hidden="true" />
              {t("preview.reader_view")}
            </Link>
          </div>
          <BookmarkMarkdownComponent>
            {bookmark as ZBookmarkTypeText}
          </BookmarkMarkdownComponent>
        </div>
      </div>
    </ScrollArea>
  );
}
