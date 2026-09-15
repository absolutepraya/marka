# First-class uploaded video bookmarks

Status: accepted

Issue #64 promotes uploaded videos from attachment-only assets to top-level
bookmarks. A top-level uploaded video remains an asset bookmark rather than a
new bookmark content kind:

```ts
{
  type: BookmarkTypes.ASSET,
  assetType: "video",
  assetId: "...",
}
```

`BookmarkTypes` describes the broad content shape (`link`, `text`, or
`asset`). The asset subtype and MIME type describe the uploaded file and its
renderer. This keeps uploaded images, PDFs, videos, audio, and any future
binary asset formats on one extensible binary-asset path.

## Decisions

- MP4 and WebM are supported for in-browser playback and download.
- MKV is accepted for storage and download, but is download-first because
  browser playback is not portable.
- Unsupported codecs use the same explicit download fallback. Karakeep does not
  transcode uploaded videos in this issue.
- The existing global `MAX_ASSET_SIZE_MB` limit remains authoritative, with a
  default of 50 MB for every uploaded asset type.
- Filename, size, and MIME type are preserved. Server-side poster extraction,
  duration extraction, caption ingestion, and transcription are later work.
- The dashboard preview renders a native accessible player. Authenticated
  bookmark cards use a static video affordance, while public lists may render
  a non-autoplaying player with metadata preloading.
- Existing link-video assets and video attachments are not migrated. The new
  top-level capability applies to newly created uploaded video bookmarks.
- Video access reuses existing bookmark, list, and public signed-asset
  authorization. It does not introduce a separate video ACL.

## Consequences

The shared content-support registry becomes the source of truth for whether a
video MIME type can be uploaded, attached, or promoted to a top-level asset
bookmark. Bookmark APIs expose the stored MIME type so clients can choose the
correct player behavior without trusting upload request metadata.

The supported-format documentation must distinguish playback support from raw
storage support: MP4 and WebM provide playback and download, while MKV
provides download with no portable browser-playback guarantee.
