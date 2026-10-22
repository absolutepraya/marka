import { eq } from "drizzle-orm";

import type { KarakeepDBTransaction } from "@karakeep/db";
import { definePersist } from "@karakeep/db/persist";
import { assets } from "@karakeep/db/schema";

/** JSON-safe subset of an asset row that jobs write. */
// Type aliases, not interfaces: persist inputs must satisfy JsonValue.
// oxlint-disable-next-line typescript-eslint/consistent-type-definitions
export type AssetRecord = {
  id: string;
  bookmarkId?: string | null;
  userId: string;
  assetType: (typeof assets.$inferInsert)["assetType"];
  contentType?: string | null;
  size?: number;
  fileName?: string | null;
  transcriptId?: string | null;
};

/** Replaces `oldAssetId` (if any) with `newAsset` inside `txn`. */
export async function updateAsset(
  oldAssetId: string | null | undefined,
  newAsset: AssetRecord,
  txn: KarakeepDBTransaction,
) {
  if (oldAssetId) {
    await txn.delete(assets).where(eq(assets.id, oldAssetId));
  }

  await txn.insert(assets).values(newAsset);
}

/**
 * Atomically swaps an asset row for a newly stored file. The caller deletes
 * the old file after this resolves.
 */
export const replaceAsset = definePersist<
  { oldAssetId: string | null; asset: AssetRecord },
  void
>("assets.replace", (db, { oldAssetId, asset }) =>
  db.transaction((tx) => updateAsset(oldAssetId, asset, tx)),
);
