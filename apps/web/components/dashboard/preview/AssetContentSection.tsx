import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n/client";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getContentFormatForBookmarkAssetType } from "@karakeep/shared/content-support";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { AudioPlayer } from "./AudioPlayer";
import ContentDownloadButton from "./ContentDownloadButton";

function PDFContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  const { t } = useTranslation();

  const initialSection = useMemo(() => {
    if (bookmark.content.type != BookmarkTypes.ASSET) {
      throw new Error("Invalid content type");
    }

    return "pdf";
  }, [bookmark]);
  const [section, setSection] = useState(initialSection);

  const screenshot = bookmark.assets.find(
    (r) => r.assetType === "assetScreenshot",
  )?.id;

  const content =
    section === "screenshot" && screenshot ? (
      <div className="relative h-full min-w-full">
        <Image
          alt="screenshot"
          src={getAssetUrl(screenshot)}
          fill={true}
          sizes="100vw"
          unoptimized
          className="object-contain"
        />
      </div>
    ) : (
      <embed
        title={bookmark.content.assetId}
        type="application/pdf"
        className="h-full w-full"
        src={getAssetUrl(bookmark.content.assetId)}
      />
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-1.5 sm:gap-2">
      <div className="flex w-full shrink-0 items-center justify-center gap-1.5 sm:gap-2">
        <Select onValueChange={setSection} value={section}>
          <SelectTrigger className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="screenshot" disabled={!screenshot}>
                {t("common.screenshot")}
              </SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <ContentDownloadButton bookmark={bookmark} size="default" />
      </div>
      <div className="min-h-0 w-full flex-1">{content}</div>
    </div>
  );
}

function ImageContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-w-full flex-col items-center gap-2 overflow-y-auto lg:overflow-hidden">
      <div className="flex w-full shrink-0 justify-center lg:hidden">
        <ContentDownloadButton bookmark={bookmark} size="default" />
      </div>
      <div className="relative w-full shrink-0 lg:min-h-0 lg:flex-1">
        <Link
          href={getAssetUrl(bookmark.content.assetId)}
          target="_blank"
          className="block w-full lg:relative lg:h-full"
          aria-label={t("actions.open_original")}
        >
          <div className="relative w-full lg:hidden">
            <Image
              alt=""
              src={getAssetUrl(bookmark.content.assetId)}
              width={0}
              height={0}
              unoptimized
              sizes="100vw"
              style={{ width: "100%", height: "auto" }}
            />
          </div>
          <Image
            alt="asset"
            fill={true}
            sizes="100vw"
            unoptimized
            className="hidden object-contain lg:block"
            src={getAssetUrl(bookmark.content.assetId)}
          />
        </Link>
      </div>
    </div>
  );
}

function VideoContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }

  const { t } = useTranslation();
  const assetUrl = getAssetUrl(bookmark.content.assetId);
  const fileName = bookmark.content.fileName || t("common.video");
  const isMatroska =
    bookmark.content.contentType === "video/x-matroska" ||
    bookmark.content.fileName?.toLowerCase().endsWith(".mkv") === true;
  const [playbackError, setPlaybackError] = useState(isMatroska);

  useEffect(() => {
    setPlaybackError(isMatroska);
  }, [assetUrl, bookmark.content.contentType, isMatroska]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-start gap-3 overflow-y-auto p-2 lg:justify-center lg:gap-4 lg:overflow-hidden lg:p-4">
      <div className="flex w-full shrink-0 justify-center lg:hidden">
        <ContentDownloadButton
          bookmark={bookmark}
          fileName={fileName}
          size="default"
        />
      </div>
      {playbackError ? (
        <div
          role="alert"
          className="flex max-w-md flex-col items-center gap-3 text-center text-sm text-muted-foreground"
        >
          <p>{t("common.video_playback_unavailable")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are not yet part of the uploaded-video model */}
          <video
            key={`${assetUrl}:${bookmark.content.contentType ?? ""}`}
            className="max-h-full max-w-full"
            controls
            preload="metadata"
            playsInline
            aria-label={bookmark.title || fileName}
            onError={() => setPlaybackError(true)}
          >
            <source
              src={assetUrl}
              type={bookmark.content.contentType ?? undefined}
            />
            {t("common.video_browser_unsupported")}
          </video>
        </div>
      )}
    </div>
  );
}

export function AssetContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.ASSET) {
    throw new Error("Invalid content type");
  }
  switch (
    getContentFormatForBookmarkAssetType(bookmark.content.assetType)?.id
  ) {
    case "image":
      return <ImageContentSection bookmark={bookmark} />;
    case "pdf":
      return <PDFContentSection bookmark={bookmark} />;
    case "video":
      return <VideoContentSection bookmark={bookmark} />;
    case "audio":
      return (
        <div className="flex h-full w-full items-center justify-center">
          <AudioPlayer
            src={getAssetUrl(bookmark.content.assetId)}
            fileName={bookmark.content.fileName}
            contentType={bookmark.content.contentType}
            title={bookmark.title}
            compact
          />
        </div>
      );
    default:
      return <div>Unsupported asset type</div>;
  }
}
