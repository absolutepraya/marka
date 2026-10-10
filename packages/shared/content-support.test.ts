import { describe, expect, it } from "vitest";

import {
  BOOKMARK_ASSET_TYPES,
  getDropzoneAccept,
  getBookmarkAssetTypeForMimeType,
  getFilePickerAccept,
  getSupportedMimeTypes,
  getTextDocumentTitle,
  getTextDocumentFormat,
  isContentTypeCompatibleWithAttachment,
  isTextDocumentFile,
  readTextDocument,
  TextDocumentDecodingError,
} from "./content-support";

describe("content support registry", () => {
  it("keeps the top-level asset contract limited to renderable asset types", () => {
    expect(BOOKMARK_ASSET_TYPES).toEqual(["image", "pdf", "video", "audio"]);
    expect(getBookmarkAssetTypeForMimeType("image/webp")).toBe("image");
    expect(getBookmarkAssetTypeForMimeType("application/pdf")).toBe("pdf");
    expect(getBookmarkAssetTypeForMimeType("video/mp4")).toBe("video");
    expect(getBookmarkAssetTypeForMimeType("video/webm")).toBe("video");
    expect(getBookmarkAssetTypeForMimeType("video/x-matroska")).toBe("video");
    expect(getBookmarkAssetTypeForMimeType("audio/mpeg")).toBe("audio");
    expect(getBookmarkAssetTypeForMimeType("audio/mp4")).toBe("audio");
    expect(getBookmarkAssetTypeForMimeType("audio/x-wav")).toBe("audio");
    expect(getBookmarkAssetTypeForMimeType("text/html")).toBeNull();
  });

  it("keeps upload and attachment capabilities broader than top-level bookmarks", () => {
    expect([...getSupportedMimeTypes("upload")]).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "video/webm",
      "video/x-matroska",
      "audio/mpeg",
      "audio/mp4",
      "audio/aac",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/opus",
      "text/html",
    ]);
    expect(getSupportedMimeTypes("attachment")).toEqual(
      getSupportedMimeTypes("upload"),
    );
    expect([...getSupportedMimeTypes("rawDownload")]).toEqual([
      ...getSupportedMimeTypes("upload"),
      "application/json",
      "application/ttml+xml",
      "application/x-subrip",
      "text/plain",
      "text/ssa",
      "text/vtt",
      "text/x-ssa",
      "application/zip",
    ]);
    expect(getFilePickerAccept("banner")).toBe(
      "image/gif,image/jpeg,image/png,image/webp,.gif,.jpeg,.jpg,.png,.webp",
    );
    expect(getFilePickerAccept("attachment")).toContain("video/mp4");
    expect(getFilePickerAccept("attachment")).toContain(".mkv");
    expect(getFilePickerAccept("attachment")).toContain("audio/mpeg");
    expect(getFilePickerAccept("attachment")).toContain(".mp3");
    expect(getDropzoneAccept("topLevel")).toMatchObject({
      "image/jpeg": [".gif", ".jpeg", ".jpg", ".png", ".webp"],
      "application/pdf": [".pdf"],
      "video/mp4": [".mp4", ".webm", ".mkv"],
      "video/webm": [".mp4", ".webm", ".mkv"],
      "video/x-matroska": [".mp4", ".webm", ".mkv"],
      "audio/mpeg": [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga", ".opus"],
      "text/markdown": [".md", ".markdown", ".txt"],
      "text/plain": [".md", ".markdown", ".txt"],
    });
  });

  it("recognizes text documents by MIME type or safe extension fallback", () => {
    expect(isTextDocumentFile("notes.md", "application/octet-stream")).toBe(
      true,
    );
    expect(isTextDocumentFile("notes.markdown", "text/markdown")).toBe(true);
    expect(isTextDocumentFile("notes.txt", "text/plain")).toBe(true);
    expect(isTextDocumentFile("notes.txt", "application/pdf")).toBe(false);
    expect(isTextDocumentFile("notes.bin", "application/octet-stream")).toBe(
      false,
    );
  });

  it("derives a non-empty title from each supported text extension", () => {
    expect(getTextDocumentTitle("notes.md")).toBe("notes");
    expect(getTextDocumentTitle("notes.markdown")).toBe("notes");
    expect(getTextDocumentTitle("notes.txt")).toBe("notes");
    expect(getTextDocumentTitle(".txt")).toBe(".txt");
  });

  it("preserves the authoring format from the filename", () => {
    expect(getTextDocumentFormat("notes.md")).toBe("markdown");
    expect(getTextDocumentFormat("notes.markdown")).toBe("markdown");
    expect(getTextDocumentFormat("notes.txt")).toBe("plain");
    expect(getTextDocumentFormat("notes.txt", "text/markdown")).toBe(
      "markdown",
    );
  });

  it("reads valid UTF-8 without changing the source", async () => {
    const source = "# Notes\n\nEmoji: 🦦\n\n- [ ] preserve Markdown";
    const file = new File([new TextEncoder().encode(source)], "notes.md");

    await expect(readTextDocument(file)).resolves.toBe(source);
  });

  it("rejects text files that are not valid UTF-8", async () => {
    const file = new File([new Uint8Array([0xc3, 0x28])], "notes.txt");

    await expect(readTextDocument(file)).rejects.toBeInstanceOf(
      TextDocumentDecodingError,
    );
  });

  it("preserves file read failures instead of treating them as decoding errors", async () => {
    const error = new Error("Unable to read file");
    const file = {
      arrayBuffer: async () => {
        throw error;
      },
    };

    await expect(readTextDocument(file)).rejects.toBe(error);
  });

  it("matches attached asset roles to their renderable MIME types", () => {
    expect(
      isContentTypeCompatibleWithAttachment("bannerImage", "image/png"),
    ).toBe(true);
    expect(
      isContentTypeCompatibleWithAttachment("bannerImage", "video/mp4"),
    ).toBe(false);
    expect(isContentTypeCompatibleWithAttachment("video", "video/webm")).toBe(
      true,
    );
    expect(
      isContentTypeCompatibleWithAttachment("precrawledArchive", "text/html"),
    ).toBe(true);
    expect(
      isContentTypeCompatibleWithAttachment("userUploaded", "video/x-matroska"),
    ).toBe(true);
    expect(
      isContentTypeCompatibleWithAttachment("userUploaded", "audio/mpeg"),
    ).toBe(true);
  });
});
