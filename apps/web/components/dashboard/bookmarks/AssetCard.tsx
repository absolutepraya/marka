"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";
import { AudioLines, FileText, Video } from "lucide-react";

import type { ZBookmarkTypeAsset } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getSourceUrl } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLayoutAdaptingCard } from "./BookmarkLayoutAdaptingCard";
import FooterLinkURL from "./FooterLinkURL";

function AssetImage({
  bookmark,
  className,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
}) {
  const { t } = useTranslation();
  const bookmarkedAsset = bookmark.content;
  switch (bookmarkedAsset.assetType) {
    case "image": {
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt="asset"
            src={getAssetUrl(bookmarkedAsset.assetId)}
            fill={true}
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized
            className={`${className ?? ""} ease-(--ease-out) transition-transform duration-300 group-hover:scale-[1.02]`}
          />
        </Link>
      );
    }
    case "pdf": {
      const screenshotAssetId = bookmark.assets.find(
        (r) => r.assetType === "assetScreenshot",
      )?.id;
      if (!screenshotAssetId) {
        return (
          <div
            className={cn(className, "flex items-center justify-center")}
            title={t("preview.pdf_preview_unavailable")}
          >
            <FileText size={80} />
          </div>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt={t("preview.pdf_first_page_preview")}
            src={getAssetUrl(screenshotAssetId)}
            fill={true}
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized
            className={`${className ?? ""} ease-(--ease-out) transition-transform duration-300 group-hover:scale-[1.02]`}
          />
        </Link>
      );
    }
    case "video": {
      const screenshotAssetId = bookmark.assets.find(
        (r) => r.assetType === "assetScreenshot",
      )?.id;
      if (!screenshotAssetId) {
        return (
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            aria-label={t("preview.open_video_preview")}
            className={cn(className, "flex items-center justify-center")}
            title={t("preview.video_preview_unavailable")}
          >
            <Video size={80} aria-hidden="true" />
          </Link>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt={t("preview.video_first_frame_preview")}
            src={getAssetUrl(screenshotAssetId)}
            fill={true}
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized
            className={`${className ?? ""} ease-(--ease-out) transition-transform duration-300 group-hover:scale-[1.02]`}
          />
        </Link>
      );
    }
    case "audio": {
      return (
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          aria-label={`Preview ${bookmarkedAsset.fileName ?? "audio"}`}
          className={cn(className, "flex items-center justify-center")}
        >
          <AudioLines size={80} aria-hidden="true" />
        </Link>
      );
    }
    default: {
      const _exhaustiveCheck: never = bookmarkedAsset.assetType;
      return <span />;
    }
  }
}

export default function AssetCard({
  bookmark: bookmarkedAsset,
  className,
  bookmarkIndex,
}: {
  bookmark: ZBookmarkTypeAsset;
  className?: string;
  bookmarkIndex?: number;
}) {
  return (
    <BookmarkLayoutAdaptingCard
      title={bookmarkedAsset.title ?? bookmarkedAsset.content.fileName}
      footer={
        getSourceUrl(bookmarkedAsset) && (
          <FooterLinkURL url={getSourceUrl(bookmarkedAsset)} />
        )
      }
      bookmark={bookmarkedAsset}
      className={className}
      bookmarkIndex={bookmarkIndex}
      wrapTags={true}
      image={(_layout, className) => (
        <div className="relative size-full flex-1">
          <AssetImage bookmark={bookmarkedAsset} className={className} />
        </div>
      )}
    />
  );
}
