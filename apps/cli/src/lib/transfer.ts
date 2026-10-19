import { getGlobalOptions } from "./globals";
import { normalizeServerAddress } from "./config";
import { getAPIClient, getAPIClientFor } from "./trpc";
import { TRPCClientError } from "@trpc/client";
import type { BookmarkTransfer } from "@karakeep/shared/types/bookmarkTransfer";

export type APIClient = ReturnType<typeof getAPIClient>;
export interface Connection {
  serverAddr: string;
  apiKey: string;
}
export type AssetLoader = (
  asset: BookmarkTransfer["assets"][number],
) => Promise<ArrayBuffer>;

export function currentConnection(): Connection {
  return getGlobalOptions();
}

export function destinationConnection(
  serverAddr: string,
  apiKey: string,
): Connection {
  return { serverAddr: normalizeServerAddress(serverAddr), apiKey };
}

export async function requirePortability(api: APIClient) {
  try {
    const capabilities = await api.bookmarkPortability.capabilities.query();
    if (capabilities.version !== 1)
      throw new Error("Unsupported transfer version");
  } catch (error) {
    if (!(error instanceof TRPCClientError) || error.data?.code !== "NOT_FOUND")
      throw error;
    throw new Error(
      "Server must support Marka bookmark transfer version 1. Upgrade the server before exporting, restoring, or migrating.",
      { cause: error },
    );
  }
}

export function remoteAssetLoader(connection: Connection): AssetLoader {
  return async (asset) => {
    const response = await fetch(
      `${normalizeServerAddress(connection.serverAddr)}/api/assets/${encodeURIComponent(asset.id)}`,
      {
        headers: { authorization: `Bearer ${connection.apiKey}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok)
      throw new Error(`Asset download failed: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.size)
      throw new Error("Asset download has a different size from its metadata");
    return bytes;
  };
}

export async function importBookmark(
  snapshot: BookmarkTransfer,
  connection: Connection,
  loadAsset: AssetLoader,
  { excludeTags = false }: { excludeTags?: boolean } = {},
) {
  const api = getAPIClientFor(connection);
  const assetIds: Record<string, string> = Object.create(null);
  let imported = false;
  try {
    for (const asset of snapshot.assets) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([await loadAsset(asset)], { type: asset.contentType }),
        asset.fileName ?? asset.id,
      );
      const response = await fetch(
        `${connection.serverAddr}/api/v1/assets/restore`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${connection.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!response.ok)
        throw new Error(`Asset upload failed: HTTP ${response.status}`);
      const uploaded = (await response.json()) as { assetId: string };
      assetIds[asset.id] = uploaded.assetId;
    }
    const result = await api.bookmarkPortability.import.mutate({
      snapshot,
      assetIds,
    });
    imported = true;
    if (!excludeTags && snapshot.bookmark.tags.length) {
      await api.bookmarks.updateTags.mutate({
        bookmarkId: result.bookmarkId,
        attach: snapshot.bookmark.tags.map((tag) => ({
          tagName: tag.name,
          attachedBy: tag.attachedBy,
        })),
        detach: [],
      });
    }
    return result.bookmarkId;
  } finally {
    if (!imported) {
      // The import transaction either attached all uploads or none. Clean up
      // only uploads still unattached; never remove a successfully saved file.
      await Promise.allSettled(
        Object.values(assetIds).map((assetId) =>
          api.assets.deleteUnattachedAsset.mutate({ assetId }),
        ),
      );
    }
  }
}

export function excludeSnapshotAssets(
  snapshot: BookmarkTransfer,
): BookmarkTransfer {
  if (snapshot.bookmark.content.type === "asset")
    throw new Error("Asset bookmarks require their primary file");
  return {
    ...snapshot,
    assets: [],
    transcripts: snapshot.transcripts.map((t) => ({
      ...t,
      sourceAttachmentsStatus: "partial" as const,
    })),
    bookmark: {
      ...snapshot.bookmark,
      assets: [],
      content:
        snapshot.bookmark.content.type === "link"
          ? { ...snapshot.bookmark.content, contentAssetId: null }
          : snapshot.bookmark.content,
    },
  };
}
