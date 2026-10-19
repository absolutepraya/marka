import { stdin as input, stderr as output } from "node:process";
import readline from "node:readline/promises";
import { Command, Option } from "@commander-js/extra-typings";
import { pageSize } from "@/lib/arguments";
import { loadAccount, listMembership, restoreAccount } from "@/lib/account";
import {
  printErrorMessageWithReason,
  printObject,
  printStatusMessage,
} from "@/lib/output";
import { getAPIClient, getAPIClientFor } from "@/lib/trpc";
import {
  currentConnection,
  destinationConnection,
  excludeSnapshotAssets,
  importBookmark,
  remoteAssetLoader,
  requirePortability,
} from "@/lib/transfer";
import { PORTABLE_DATA_EXCLUSIONS } from "@karakeep/shared/types/bookmarkTransfer";

export const migrateCmd = new Command("migrate")
  .description(
    "copy your portable library to another server; sharing grants remain excluded",
  )
  .requiredOption("--dest-server <url>", "destination server URL")
  .addOption(
    new Option("--dest-api-key <key>", "destination API key")
      .env("KARAKEEP_DEST_API_KEY")
      .makeOptionMandatory(),
  )
  .option("-y, --yes", "skip confirmation prompt")
  .option("--exclude-assets", "skip asset bookmarks and attached files")
  .option("--exclude-lists", "exclude lists and membership")
  .option("--exclude-tags", "exclude tags")
  .option("--exclude-ai-prompts", "exclude prompts")
  .option("--exclude-rules", "exclude rules")
  .option("--exclude-feeds", "exclude feeds")
  .option("--exclude-webhooks", "exclude webhooks")
  .option("--exclude-bookmarks", "exclude bookmarks")
  .option("--exclude-user-settings", "exclude preferences")
  .option("--batch-size <n>", "bookmarks per page (1 to 100)", pageSize, 50)
  .action(async (opts) => {
    const source = currentConnection();
    const destination = destinationConnection(opts.destServer, opts.destApiKey);
    if (
      source.serverAddr === destination.serverAddr &&
      source.apiKey === destination.apiKey
    )
      throw new Error(
        "Source and destination must be different accounts or servers",
      );
    const src = getAPIClient(),
      dest = getAPIClientFor(destination);
    if (!opts.yes) {
      const rl = readline.createInterface({ input, output });
      try {
        const answer = (
          await rl.question(
            `Copy library from ${source.serverAddr} to ${destination.serverAddr}? (yes/no): `,
          )
        )
          .trim()
          .toLowerCase();
        if (!["y", "yes"].includes(answer))
          throw new Error("Migration aborted");
      } finally {
        rl.close();
      }
    }
    const summary = { migrated: 0, excluded: 0, failed: 0 };
    try {
      if (!opts.excludeBookmarks) {
        await requirePortability(src);
        await requirePortability(dest);
      }
      const account = await loadAccount(src, opts);
      // Read source metadata before the first destination write.
      if (account.webhooks?.some((w) => w.hasToken))
        throw new Error(
          "Secret webhook tokens cannot be copied. Use --exclude-webhooks and recreate them explicitly.",
        );
      const membership = !opts.excludeBookmarks
        ? await listMembership(src, account)
        : {};
      const maps = await restoreAccount(account, dest);
      if (!opts.excludeBookmarks) {
        let cursor;
        do {
          const page = await src.bookmarks.getBookmarks.query({
            limit: opts.batchSize,
            cursor,
            useCursorV2: true,
          });
          for (const bookmark of page.bookmarks) {
            if (opts.excludeAssets && bookmark.content.type === "asset") {
              summary.excluded++;
              continue;
            }
            try {
              let snapshot = await src.bookmarkPortability.export.query({
                bookmarkId: bookmark.id,
                includeAssets: !opts.excludeAssets,
              });
              if (opts.excludeAssets)
                snapshot = excludeSnapshotAssets(snapshot);
              const id = await importBookmark(
                snapshot,
                destination,
                remoteAssetLoader(source),
                { excludeTags: opts.excludeTags },
              );
              for (const listId of membership[bookmark.id] ?? []) {
                const target = maps.lists.get(listId);
                if (target)
                  await dest.lists.addToList.mutate({
                    listId: target,
                    bookmarkId: id,
                  });
              }
              summary.migrated++;
            } catch (error) {
              summary.failed++;
              printErrorMessageWithReason(
                `Failed migrating bookmark ${bookmark.id}`,
                error as object,
              );
            }
          }
          cursor = page.nextCursor;
        } while (cursor);
      }
    } catch (error) {
      summary.failed++;
      printErrorMessageWithReason("Migration failed", error as object);
    }
    const success = summary.failed === 0;
    printStatusMessage(
      success,
      success
        ? "Migration completed"
        : "Migration incomplete; inspect failed items before retrying",
    );
    printObject({
      success,
      ...summary,
      exclusions: [
        ...PORTABLE_DATA_EXCLUSIONS,
        ...Object.entries(opts)
          .filter(([key, value]) => key.startsWith("exclude") && value)
          .map(([key]) => key),
      ],
    });
  });
