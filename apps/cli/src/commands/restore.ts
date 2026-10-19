import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { Command } from "@commander-js/extra-typings";
import superjson from "superjson";
import { z } from "zod";
import { MAX_ARCHIVE_MEMBER_BYTES } from "@/lib/archive";
import { zAccountDataSchema, restoreAccount } from "@/lib/account";
import {
  printErrorMessageWithReason,
  printObject,
  printStatusMessage,
} from "@/lib/output";
import {
  currentConnection,
  importBookmark,
  requirePortability,
} from "@/lib/transfer";
import { getAPIClient } from "@/lib/trpc";
import { zBookmarkTransferSchema } from "@karakeep/shared/types/bookmarkTransfer";

const execute = promisify(execFile);
const manifestSchema = z.object({
  format: z.literal("karakeep.dump"),
  version: z.literal(2),
  complete: z.literal(true),
  exclusions: z.array(z.string()),
  counts: z.object({
    bookmarks: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
    highlights: z.number().int().nonnegative(),
    transcripts: z.number().int().nonnegative(),
  }),
  assetSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
const accountSchema = z.object({
  account: zAccountDataSchema,
  membership: z.record(z.string(), z.array(z.string())),
});
export const restoreCmd = new Command("restore")
  .description(
    "restore a version 2 portable library archive to the configured account",
  )
  .argument("<archive>", "archive created by marka dump")
  .requiredOption("--yes", "confirm creating records in the configured account")
  .action(async (archive) => {
    const api = getAPIClient();
    const connection = currentConnection();
    const summary = { restored: 0, failed: 0 };
    try {
      // tar streams named entries to stdout. Never extract an untrusted archive
      // onto the filesystem, where symlinks and traversal could overwrite files.
      const readEntry = async (entry: string) =>
        (
          await execute("tar", ["-xOzf", archive, "--", entry], {
            encoding: "buffer",
            maxBuffer: MAX_ARCHIVE_MEMBER_BYTES,
          })
        ).stdout;
      const manifest = manifestSchema.parse(
        JSON.parse((await readEntry("manifest.json")).toString()),
      );
      const account = accountSchema.parse(
        superjson.deserialize(
          JSON.parse((await readEntry("account.json")).toString()),
        ),
      );
      const records = (await readEntry("bookmarks/state.jsonl"))
        .toString()
        .split("\n")
        .filter(Boolean)
        .map((line) =>
          zBookmarkTransferSchema.parse(
            superjson.deserialize(JSON.parse(line).snapshot),
          ),
        );
      if (
        records.length !== manifest.counts.bookmarks ||
        new Set(records.map((record) => record.bookmark.id)).size !==
          records.length ||
        records.reduce((count, record) => count + record.assets.length, 0) !==
          manifest.counts.assets ||
        records.reduce(
          (count, record) => count + record.highlights.length,
          0,
        ) !== manifest.counts.highlights ||
        records.reduce(
          (count, record) => count + record.transcripts.length,
          0,
        ) !== manifest.counts.transcripts
      )
        throw new Error("Archive record counts do not match manifest");
      const listIds = new Set(account.account.lists?.map((list) => list.id));
      if (
        Object.entries(account.membership).some(
          ([id, lists]) =>
            !records.some((record) => record.bookmark.id === id) ||
            lists.some((list) => !listIds.has(list)),
        )
      )
        throw new Error(
          "Archive membership references a missing bookmark or list",
        );
      // Validate every record and required file before the first server write.
      for (const snapshot of records)
        for (const asset of snapshot.assets) {
          if (!/^[A-Za-z0-9_-]+$/.test(asset.id))
            throw new Error("Invalid asset ID in archive");
          const bytes = await readEntry(`assets/${asset.id}`);
          if (bytes.length !== asset.size)
            throw new Error(`Asset size mismatch: ${asset.id}`);
          if (
            createHash("sha256").update(bytes).digest("hex") !==
            manifest.assetSha256[asset.id]
          )
            throw new Error(`Asset checksum mismatch: ${asset.id}`);
        }
      if (account.account.webhooks?.some((w) => w.hasToken))
        throw new Error(
          "Archive has webhooks with secret tokens. Export with --exclude-webhooks and configure those webhooks explicitly.",
        );
      await requirePortability(api);
      const maps = await restoreAccount(account.account, api);
      for (const snapshot of records) {
        try {
          const id = await importBookmark(
            snapshot,
            connection,
            async (asset) =>
              new Uint8Array(await readEntry(`assets/${asset.id}`)).buffer,
          );
          for (const list of account.membership[snapshot.bookmark.id] ?? []) {
            const target = maps.lists.get(list);
            if (target)
              await api.lists.addToList.mutate({
                listId: target,
                bookmarkId: id,
              });
          }
          summary.restored++;
        } catch (error) {
          summary.failed++;
          printErrorMessageWithReason(
            `Failed restoring bookmark ${snapshot.bookmark.id}`,
            error as object,
          );
        }
      }
      printStatusMessage(
        summary.failed === 0,
        summary.failed ? "Restore incomplete" : "Restore completed",
      );
      printObject({
        success: summary.failed === 0,
        ...summary,
        exclusions: manifest.exclusions,
      });
    } catch (error) {
      summary.failed++;
      printErrorMessageWithReason("Restore failed", error as object);
      printObject({ success: false, ...summary });
    }
  });
