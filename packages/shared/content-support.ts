import { ASSET_TYPES } from "./asset-types";

export const BOOKMARK_ASSET_TYPES = ["image", "pdf", "video", "audio"] as const;
export type BookmarkAssetType = (typeof BOOKMARK_ASSET_TYPES)[number];

export const TEXT_DOCUMENT_FORMATS = ["markdown", "plain"] as const;
export type TextDocumentFormat = (typeof TEXT_DOCUMENT_FORMATS)[number];

export type ContentSupportCapability =
  | "upload"
  | "topLevel"
  | "attachment"
  | "banner"
  | "rawDownload";

interface ContentSupportDefinition {
  id:
    | "image"
    | "pdf"
    | "video"
    | "audio"
    | "html"
    | "markdown"
    | "caption"
    | "zip";
  mimeTypes: readonly string[];
  extensions: readonly string[];
  capabilities: readonly ContentSupportCapability[];
  bookmarkAssetType?: BookmarkAssetType;
}

export const CONTENT_SUPPORT_REGISTRY: readonly ContentSupportDefinition[] = [
  {
    id: "image",
    mimeTypes: [
      ASSET_TYPES.IMAGE_GIF,
      ASSET_TYPES.IMAGE_JPEG,
      ASSET_TYPES.IMAGE_PNG,
      ASSET_TYPES.IMAGE_WEBP,
    ],
    extensions: [".gif", ".jpeg", ".jpg", ".png", ".webp"],
    capabilities: ["upload", "topLevel", "attachment", "banner", "rawDownload"],
    bookmarkAssetType: "image",
  },
  {
    id: "pdf",
    mimeTypes: [ASSET_TYPES.APPLICATION_PDF],
    extensions: [".pdf"],
    capabilities: ["upload", "topLevel", "attachment", "rawDownload"],
    bookmarkAssetType: "pdf",
  },
  {
    id: "video",
    mimeTypes: [
      ASSET_TYPES.VIDEO_MP4,
      ASSET_TYPES.VIDEO_WEBM,
      ASSET_TYPES.VIDEO_MKV,
    ],
    extensions: [".mp4", ".webm", ".mkv"],
    capabilities: ["upload", "topLevel", "attachment", "rawDownload"],
    bookmarkAssetType: "video",
  },
  {
    id: "audio",
    mimeTypes: [
      ASSET_TYPES.AUDIO_MPEG,
      ASSET_TYPES.AUDIO_MP4,
      ASSET_TYPES.AUDIO_AAC,
      ASSET_TYPES.AUDIO_WAV,
      ASSET_TYPES.AUDIO_X_WAV,
      ASSET_TYPES.AUDIO_OGG,
      ASSET_TYPES.AUDIO_OPUS,
    ],
    extensions: [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus"],
    capabilities: ["upload", "topLevel", "attachment", "rawDownload"],
    bookmarkAssetType: "audio",
  },
  {
    id: "html",
    mimeTypes: [ASSET_TYPES.TEXT_HTML],
    extensions: [".html", ".htm"],
    capabilities: ["upload", "attachment", "rawDownload"],
  },
  {
    id: "markdown",
    mimeTypes: ["text/markdown", "text/plain"],
    extensions: [".md", ".markdown", ".txt"],
    capabilities: ["topLevel"],
  },
  {
    id: "caption",
    mimeTypes: [
      "application/json",
      "application/ttml+xml",
      "application/x-subrip",
      "text/plain",
      "text/ssa",
      "text/vtt",
      "text/x-ssa",
    ],
    extensions: [
      ".ass",
      ".dfxp",
      ".json3",
      ".lrc",
      ".srt",
      ".srv1",
      ".srv2",
      ".srv3",
      ".ssa",
      ".ttml",
      ".vtt",
    ],
    capabilities: ["rawDownload"],
  },
  {
    id: "zip",
    mimeTypes: [ASSET_TYPES.APPLICATION_ZIP],
    extensions: [".zip"],
    capabilities: ["rawDownload"],
  },
];

export function getSupportedContentFormats(
  capability: ContentSupportCapability,
) {
  return CONTENT_SUPPORT_REGISTRY.filter((format) =>
    format.capabilities.includes(capability),
  );
}

export function getSupportedMimeTypes(
  capability: ContentSupportCapability,
): Set<string> {
  return new Set(
    getSupportedContentFormats(capability).flatMap(
      (format) => format.mimeTypes,
    ),
  );
}

export function getSupportedMimeTypesForFormat(
  formatId: Exclude<ContentSupportDefinition["id"], "zip">,
): Set<string> {
  const format = CONTENT_SUPPORT_REGISTRY.find(
    (candidate) => candidate.id === formatId,
  );
  return new Set(format?.mimeTypes ?? []);
}

export function getFilePickerAccept(
  capability: ContentSupportCapability,
): string {
  const values = new Set<string>();
  for (const format of getSupportedContentFormats(capability)) {
    format.mimeTypes.forEach((mimeType) => values.add(mimeType));
    format.extensions.forEach((extension) => values.add(extension));
  }
  return [...values].join(",");
}

export function getDropzoneAccept(
  capability: ContentSupportCapability,
): Record<string, string[]> {
  return Object.fromEntries(
    getSupportedContentFormats(capability).flatMap((format) =>
      format.mimeTypes.map((mimeType) => [mimeType, [...format.extensions]]),
    ),
  );
}

export function getBookmarkAssetTypeForMimeType(
  contentType: string,
): BookmarkAssetType | null {
  const format = getSupportedContentFormats("topLevel").find(
    (candidate) =>
      candidate.bookmarkAssetType && candidate.mimeTypes.includes(contentType),
  );
  return format?.bookmarkAssetType ?? null;
}

export function getContentFormatForBookmarkAssetType(
  assetType: BookmarkAssetType,
) {
  return CONTENT_SUPPORT_REGISTRY.find(
    (format) => format.bookmarkAssetType === assetType,
  );
}

export function isContentTypeCompatibleWithAttachment(
  assetType: string,
  contentType: string | null | undefined,
): boolean {
  if (!contentType) {
    return true;
  }

  const format = CONTENT_SUPPORT_REGISTRY.find((candidate) =>
    candidate.mimeTypes.includes(contentType),
  );
  if (!format || !format.capabilities.includes("attachment")) {
    return false;
  }

  switch (assetType) {
    case "bannerImage":
    case "screenshot":
    case "assetScreenshot":
      return format.id === "image";
    case "pdf":
      return format.id === "pdf";
    case "video":
      return format.id === "video";
    case "precrawledArchive":
      return format.id === "html";
    case "userUploaded":
      return true;
    default:
      return false;
  }
}

export function isTextDocumentFile(
  fileName: string,
  mimeType?: string,
): boolean {
  const format = CONTENT_SUPPORT_REGISTRY.find(
    (candidate) => candidate.id === "markdown",
  );
  if (!format) {
    return false;
  }
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  if (format.mimeTypes.includes(normalizedMimeType)) {
    return true;
  }

  const hasGenericMimeType =
    normalizedMimeType === "" ||
    normalizedMimeType === "application/octet-stream";
  return (
    hasGenericMimeType &&
    format.extensions.some((extension) =>
      fileName.toLowerCase().endsWith(extension),
    )
  );
}

/**
 * @deprecated Use isTextDocumentFile for Markdown and plain-text documents.
 */
export function isMarkdownFile(fileName: string, mimeType?: string): boolean {
  return isTextDocumentFile(fileName, mimeType);
}

export function getTextDocumentTitle(fileName: string): string {
  const title = fileName.replace(/\.(?:md|markdown|txt)$/i, "");
  return title || fileName;
}

export function getTextDocumentFormat(
  fileName: string,
  mimeType?: string,
): TextDocumentFormat {
  return mimeType?.trim().toLowerCase() === "text/markdown" ||
    /\.(?:md|markdown)$/i.test(fileName)
    ? "markdown"
    : "plain";
}

export class TextDocumentDecodingError extends Error {
  constructor() {
    super("Text document must be UTF-8");
    this.name = "TextDocumentDecodingError";
  }
}

export async function readTextDocument(file: {
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TextDocumentDecodingError();
  }
}
