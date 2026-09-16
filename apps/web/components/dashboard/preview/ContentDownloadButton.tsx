import Link from "next/link";
import { Download } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

function safeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-");
}

function getDownloadTarget(bookmark: ZBookmark, fileNameOverride?: string) {
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return {
      assetId: bookmark.content.assetId,
      fileName:
        fileNameOverride ??
        bookmark.content.fileName ??
        getBookmarkTitle(bookmark) ??
        "download",
    };
  }

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  if (bookmark.content.pdfAssetId) {
    return {
      assetId: bookmark.content.pdfAssetId,
      fileName: `${getBookmarkTitle(bookmark) ?? "bookmark"}.pdf`,
    };
  }

  const archiveAssetId =
    bookmark.content.fullPageArchiveAssetId ??
    bookmark.content.precrawledArchiveAssetId;
  if (archiveAssetId) {
    return {
      assetId: archiveAssetId,
      fileName: `${getBookmarkTitle(bookmark) ?? "bookmark"}.html`,
    };
  }

  return null;
}

export default function ContentDownloadButton({
  bookmark,
  className,
  fileName: fileNameOverride,
  size = "sm",
}: {
  bookmark: ZBookmark;
  className?: string;
  fileName?: string;
  size?: "default" | "sm";
}) {
  const { t } = useTranslation();
  const target = getDownloadTarget(bookmark, fileNameOverride);
  if (!target) {
    return null;
  }

  const fileName = safeFileName(target.fileName) || "download";
  return (
    <Link
      href={getAssetUrl(target.assetId)}
      download={fileName}
      className={cn(buttonVariants({ variant: "outline", size }), className)}
      aria-label={t("actions.download_file", { fileName })}
    >
      <Download className="mr-2 size-4" aria-hidden="true" />
      {t("actions.download")}
    </Link>
  );
}
