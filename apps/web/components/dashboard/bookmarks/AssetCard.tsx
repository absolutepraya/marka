"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
            title="PDF first-page preview is not available. Run asset preprocessing to generate it"
          >
            <FileText size={80} />
          </div>
        );
      }
      return (
        <Link href={`/dashboard/preview/${bookmark.id}`}>
          <Image
            alt="PDF first-page preview"
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
      return (
        <Link
          href={`/dashboard/preview/${bookmark.id}`}
          aria-label={`Preview ${bookmarkedAsset.fileName ?? "video"}`}
          className={cn(className, "flex items-center justify-center")}
        >
          <Video size={80} aria-hidden="true" />
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
