import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Command } from "@commander-js/extra-typings";
import superjson from "superjson";
import { MAX_ARCHIVE_MEMBER_BYTES } from "@/lib/archive";
import { pageSize } from "@/lib/arguments";
import { loadAccount, listMembership, validateAccount } from "@/lib/account";
import {
  printErrorMessageWithReason,
  printObject,
  printStatusMessage,
} from "@/lib/output";
import {
  currentConnection,
  excludeSnapshotAssets,
  remoteAssetLoader,
  requirePortability,
} from "@/lib/transfer";
import { getAPIClient } from "@/lib/trpc";
import { PORTABLE_DATA_EXCLUSIONS } from "@karakeep/shared/types/bookmarkTransfer";

const execute = promisify(execFile);
export const dumpCmd = new Command("dump")
  .description(
    "export a versioned portable library archive; see README for exclusions",
  )
  .option("--output <file>", "output .tar.gz archive")
  .option("--exclude-assets", "exclude binary files and asset bookmarks")
  .option("--exclude-bookmarks", "exclude bookmark records")
  .option("--exclude-lists", "exclude lists and membership")
  .option("--exclude-tags", "exclude tags")
  .option("--exclude-ai-prompts", "exclude prompts")
  .option("--exclude-rules", "exclude rules")
  .option("--exclude-feeds", "exclude RSS feeds")
  .option("--exclude-webhooks", "exclude webhook configuration")
  .option("--exclude-user-settings", "exclude user preferences")
  .option("--exclude-link-content", "exclude cached link HTML")
  .option("--batch-size <n>", "bookmarks per page (1 to 100)", pageSize, 50)
  .action(async (opts) => {
    const api = getAPIClient();
    const connection = currentConnection();
    if (!opts.excludeBookmarks) await requirePortability(api);
    const workRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "marka-dump-"));
    const output = path.resolve(
      opts.output ??
        `karakeep-dump-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`,
    );
    const counts = {
      bookmarks: 0,
      assets: 0,
      highlights: 0,
      transcripts: 0,
      excluded: 0,
      failed: 0,
    };
    const assetSha256: Record<string, string> = {};
    const exportedBookmarkIds = new Set<string>();
    try {
      const account = await loadAccount(api, opts);
      const secretWebhooks =
        account.webhooks?.filter((webhook) => webhook.hasToken) ?? [];
      if (account.webhooks)
        account.webhooks = account.webhooks.filter(
          (webhook) => !webhook.hasToken,
        );
      validateAccount(account);
      const membership = !opts.excludeBookmarks
        ? await listMembership(api, account)
        : {};
      const sharing: Record<string, unknown> = {};
      for (const list of account.lists ?? [])
        sharing[list.id] = await api.lists.getCollaborators.query({
          listId: list.id,
        });
      await fsp.mkdir(path.join(workRoot, "bookmarks"));
      await fsp.mkdir(path.join(workRoot, "assets"));
      const stateFile = await fsp.open(
        path.join(workRoot, "bookmarks/state.jsonl"),
        "w",
      );
      try {
        if (!opts.excludeBookmarks) {
          let cursor;
          do {
            const page = await api.bookmarks.getBookmarks.query({
              cursor,
              limit: opts.batchSize,
              useCursorV2: true,
            });
            for (const bookmark of page.bookmarks) {
              if (opts.excludeAssets && bookmark.content.type === "asset") {
                counts.excluded++;
                continue;
              }
              let snapshot = await api.bookmarkPortability.export.query({
                bookmarkId: bookmark.id,
                includeAssets: !opts.excludeAssets,
              });
              if (opts.excludeAssets)
                snapshot = excludeSnapshotAssets(snapshot);
              if (opts.excludeTags) snapshot.bookmark.tags = [];
              if (
                opts.excludeLinkContent &&
                snapshot.bookmark.content.type === "link"
              ) {
                snapshot.bookmark.content.htmlContent = null;
                snapshot.bookmark.content.contentAssetId = null;
                snapshot.assets = snapshot.assets.filter(
                  (asset) => asset.assetType !== "linkHtmlContent",
                );
              }
              for (const asset of snapshot.assets) {
                if (asset.size > MAX_ARCHIVE_MEMBER_BYTES)
                  throw new Error(
                    "Portable archive members must not exceed 256 MiB",
                  );
                // IDs are server-generated but still validate paths before writing.
                if (!/^[A-Za-z0-9_-]+$/.test(asset.id))
                  throw new Error("Invalid asset ID in server response");
                const bytes = new Uint8Array(
                  await remoteAssetLoader(connection)(asset),
                );
                assetSha256[asset.id] = createHash("sha256")
                  .update(bytes)
                  .digest("hex");
                await fsp.writeFile(
                  path.join(workRoot, "assets", asset.id),
                  bytes,
                );
                counts.assets++;
              }
              const contentAccess =
                await api.bookmarks.getContentPermissions.query({
                  bookmarkId: bookmark.id,
                });
              await stateFile.write(
                JSON.stringify({
                  snapshot: superjson.serialize(snapshot),
                  contentAccess,
                }) + "\n",
              );
              exportedBookmarkIds.add(bookmark.id);
              counts.bookmarks++;
              counts.highlights += snapshot.highlights.length;
              counts.transcripts += snapshot.transcripts.length;
            }
            cursor = page.nextCursor;
          } while (cursor);
        }
      } finally {
        await stateFile.close();
      }
      const ownedMembership = Object.fromEntries(
        Object.entries(membership).filter(([id]) =>
          exportedBookmarkIds.has(id),
        ),
      );
      await fsp.writeFile(
        path.join(workRoot, "account.json"),
        JSON.stringify(
          superjson.serialize({
            account,
            membership: ownedMembership,
            sharing,
            secretWebhooks,
          }),
        ),
      );
      for (const entry of ["account.json", "bookmarks/state.jsonl"]) {
        if (
          (await fsp.stat(path.join(workRoot, entry))).size >
          MAX_ARCHIVE_MEMBER_BYTES
        )
          throw new Error("Portable archive members must not exceed 256 MiB");
      }
      const excluded = Object.entries(opts)
        .filter(([key, value]) => key.startsWith("exclude") && value)
        .map(([key]) => key);
      await fsp.writeFile(
        path.join(workRoot, "manifest.json"),
        JSON.stringify(
          {
            format: "karakeep.dump",
            version: 2,
            serialization: "superjson",
            complete: true,
            scope: "portable-library",
            exportedAt: new Date().toISOString(),
            counts,
            assetSha256,
            exclusions: [...PORTABLE_DATA_EXCLUSIONS, ...excluded],
          },
          null,
          2,
        ),
      );
      await fsp.mkdir(path.dirname(output), { recursive: true });
      // Write atomically so a failed export cannot leave a plausible archive.
      const staged = path.join(workRoot, "export.tar.gz");
      await execute("tar", [
        "-czf",
        staged,
        "-C",
        workRoot,
        "manifest.json",
        "account.json",
        "bookmarks",
        "assets",
      ]);
      const destinationStage = await fsp.mkdtemp(
        path.join(path.dirname(output), ".marka-export-"),
      );
      try {
        const prepared = path.join(destinationStage, "export.tar.gz");
        await fsp.copyFile(staged, prepared);
        await fsp.chmod(prepared, 0o600);
        await fsp.rename(prepared, output);
      } finally {
        await fsp.rm(destinationStage, { recursive: true, force: true });
      }
      printStatusMessage(true, `Export completed: ${output}`);
      printObject({
        success: true,
        output,
        version: 2,
        counts,
        exclusions: [...PORTABLE_DATA_EXCLUSIONS, ...excluded],
      });
    } catch (error) {
      counts.failed++;
      printErrorMessageWithReason(
        "Export failed; no complete archive was produced",
        error as object,
      );
      printObject({ success: false, counts });
    } finally {
      await fsp.rm(workRoot, { recursive: true, force: true });
    }
  });
