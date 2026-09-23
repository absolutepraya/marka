import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkTranscripts,
  bookmarks,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Transcript routes", () => {
  test<CustomTestContext>("prefers Azure Speech over the legacy Azure Whisper record", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://www.youtube.com/watch?v=provider-priority",
    });
    await db.insert(bookmarkTranscripts).values([
      {
        bookmarkId: bookmark.id,
        provider: "azure-whisper",
        providerItemId: "legacy-item",
        status: "ready",
        text: "Legacy transcript",
      },
      {
        bookmarkId: bookmark.id,
        provider: "azure-speech",
        providerItemId: "speech-item",
        status: "ready",
        text: "MAI transcript",
      },
    ]);

    await expect(
      api.transcripts.get({ bookmarkId: bookmark.id }),
    ).resolves.toMatchObject({
      provider: "azure-speech",
      text: "MAI transcript",
    });
  });

  test<CustomTestContext>("falls back to the legacy Azure Whisper transcript", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://www.youtube.com/watch?v=legacy-fallback",
    });
    await db.insert(bookmarkTranscripts).values({
      bookmarkId: bookmark.id,
      provider: "azure-whisper",
      providerItemId: "legacy-item",
      status: "ready",
      text: "Legacy transcript",
    });

    await expect(
      api.transcripts.get({ bookmarkId: bookmark.id }),
    ).resolves.toMatchObject({
      provider: "azure-whisper",
      text: "Legacy transcript",
    });
  });

  test<CustomTestContext>("preserves the edited legacy transcript when retry creates Azure Speech", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const user = await api.users.whoami();
    const bookmarkId = "audio-legacy-transcript";
    await db.insert(bookmarks).values({
      id: bookmarkId,
      userId: user.id,
      type: BookmarkTypes.ASSET,
      source: "web",
    });
    await db.insert(bookmarkAssets).values({
      id: bookmarkId,
      assetType: "audio",
      assetId: "audio-source",
    });
    await db.insert(bookmarkTranscripts).values({
      bookmarkId,
      provider: "azure-whisper",
      providerItemId: "audio-source",
      status: "failed",
      manualOverride: true,
      sourceTranscript: "Original source transcript",
      text: "User-edited transcript",
      revision: 8,
    });

    const wasEnabled = serverConfig.transcription.enabled;
    serverConfig.transcription.enabled = true;
    try {
      const { TranscriptQueue } = await import("@karakeep/shared-server");
      vi.mocked(TranscriptQueue.enqueue).mockResolvedValue("transcript-job");
      await api.transcripts.retry({ bookmarkId });
    } finally {
      serverConfig.transcription.enabled = wasEnabled;
    }

    const speechTranscript = await db.query.bookmarkTranscripts.findFirst({
      where: and(
        eq(bookmarkTranscripts.bookmarkId, bookmarkId),
        eq(bookmarkTranscripts.provider, "azure-speech"),
      ),
    });
    expect(speechTranscript).toMatchObject({
      provider: "azure-speech",
      providerItemId: "audio-source",
      status: "pending",
      manualOverride: true,
      sourceTranscript: "Original source transcript",
      text: "User-edited transcript",
      revision: 8,
    });
  });

  test<CustomTestContext>("returns and edits the working transcript without changing the source transcript", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://www.youtube.com/watch?v=abc123",
    });
    const [transcript] = await db
      .insert(bookmarkTranscripts)
      .values({
        bookmarkId: bookmark.id,
        provider: "youtube",
        providerItemId: "abc123",
        status: "ready",
        sourceAttachmentsStatus: "ready",
        sourceLanguage: "en",
        sourceTranscript: "Original caption text",
        text: "Original caption text",
      })
      .returning();
    await db.insert(assets).values({
      id: "caption-source-1",
      assetType: AssetTypes.CAPTION_SOURCE,
      bookmarkId: bookmark.id,
      transcriptId: transcript.id,
      userId: bookmark.userId,
      fileName: "abc123.en.vtt",
      contentType: "text/vtt",
      size: 32,
    });

    const loaded = await api.transcripts.get({ bookmarkId: bookmark.id });
    expect(loaded?.sourceTranscript).toBe("Original caption text");
    expect(loaded?.sourceAttachments).toEqual([
      {
        id: "caption-source-1",
        assetType: "captionSource",
        fileName: "abc123.en.vtt",
      },
    ]);

    const updated = await api.transcripts.update({
      bookmarkId: bookmark.id,
      text: "Edited transcript text",
      expectedRevision: 0,
    });
    expect(updated.text).toBe("Edited transcript text");
    expect(updated.sourceTranscript).toBe("Original caption text");
    expect(updated.manualOverride).toBe(true);
    expect(updated.revision).toBe(1);

    const updatedBookmark = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmark.id),
    });
    expect(updatedBookmark?.summaryProvenance).toBe("transcript");
    expect(updatedBookmark?.summaryStale).toBe(true);

    await api.bookmarks.updateReadingProgress({
      bookmarkId: bookmark.id,
      readingProgressOffset: 20,
      readingProgressRevision: updated.revision,
    });
    await expect(
      api.bookmarks.getReadingProgress({ bookmarkId: bookmark.id }),
    ).resolves.toMatchObject({
      readingProgressOffset: 20,
      readingProgressRevision: updated.revision,
    });
  });

  test<CustomTestContext>("restores the latest source transcript and rejects stale revisions", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://youtu.be/abc123",
    });
    await db.insert(bookmarkTranscripts).values({
      bookmarkId: bookmark.id,
      provider: "youtube",
      providerItemId: "abc123",
      status: "ready",
      sourceAttachmentsStatus: "ready",
      sourceTranscript: "Latest source",
      text: "Old manual text",
      manualOverride: true,
      revision: 4,
    });

    await expect(
      api.transcripts.update({
        bookmarkId: bookmark.id,
        text: "Stale edit",
        expectedRevision: 3,
      }),
    ).rejects.toThrow(/changed since it was loaded/);

    const reset = await api.transcripts.reset({ bookmarkId: bookmark.id });
    expect(reset.text).toBe("Latest source");
    expect(reset.manualOverride).toBe(false);
    expect(reset.revision).toBe(5);
  });
});
