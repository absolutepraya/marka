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
    <ScrollArea className="h-full">
      <div className="lg:pt-14">
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
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="mb-4 flex justify-end lg:hidden">
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
