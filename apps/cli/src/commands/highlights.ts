import {
  choice,
  decodeCursor,
  encodeCursor,
  integer,
  pageSize,
} from "@/lib/arguments";
import { getGlobalOptions } from "@/lib/globals";
import {
  printError,
  printErrorMessageWithReason,
  printObject,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export const highlightsCmd = new Command()
  .name("highlights")
  .description("manipulating highlights");

function printHighlightCard(h: {
  id: string;
  bookmarkId: string;
  text: string | null;
  note: string | null;
  color: string;
  createdAt: Date;
}) {
  console.log(chalk.bold(h.text ?? "(no text)"));
  console.log(chalk.dim(`  Id:       ${h.id}`));
  console.log(chalk.dim(`  Bookmark: ${h.bookmarkId}`));
  console.log(chalk.dim(`  Color:    ${h.color}`));
  console.log(chalk.dim(`  Created:  ${h.createdAt.toISOString()}`));
  if (h.note) console.log(`  Note:     ${h.note}`);
  console.log();
}

highlightsCmd
  .command("list")
  .description("list all highlights")
  .option("--bookmark <id>", "list highlights for a specific bookmark")
  .option("--limit <limit>", "number of highlights per page", pageSize, 20)
  .option("--all", "fetch all highlights (paginate through all pages)", false)
  .option("--cursor <cursor>", "cursor from a previous request for pagination")
  .action(async (opts) => {
    const api = getAPIClient();

    try {
      if (opts.bookmark) {
        if (
          opts.cursor ||
          opts.all ||
          highlightsCmd.commands
            .find((cmd) => cmd.name() === "list")
            ?.getOptionValueSource("limit") === "cli"
        )
          throw new Error(
            "--bookmark returns all highlights for one bookmark; --limit, --cursor, and --all cannot be combined with it",
          );
        const resp = await api.highlights.getForBookmark.query({
          bookmarkId: opts.bookmark,
        });
        if (getGlobalOptions().json) {
          printObject(resp.highlights);
        } else {
          resp.highlights.forEach(printHighlightCard);
        }
      } else {
        const request = {
          limit: opts.limit,
          cursor: opts.cursor
            ? JSON.parse(
                Buffer.from(opts.cursor, "base64").toString(),
                (k, v) => (k === "createdAt" ? new Date(v) : v),
              )
            : undefined,
        };

        let resp = await api.highlights.getAll.query(request);
        let results = resp.highlights;

        if (opts.all) {
          while (resp.nextCursor) {
            resp = await api.highlights.getAll.query({
              ...request,
              cursor: resp.nextCursor,
            });
            results = [...results, ...resp.highlights];
          }
        }

        const nextCursor =
          !opts.all && resp.nextCursor
            ? Buffer.from(JSON.stringify(resp.nextCursor)).toString("base64")
            : undefined;

        if (getGlobalOptions().json) {
          printObject({ highlights: results, nextCursor });
        } else {
          results.forEach(printHighlightCard);
          if (nextCursor) {
            console.log(`Next cursor: ${chalk.dim(nextCursor)}`);
          }
        }
      }
    } catch (error) {
      printErrorMessageWithReason("Failed to list highlights", error as object);
    }
  });

highlightsCmd
  .command("get")
  .description("get a highlight by id")
  .argument("<id>", "the id of the highlight")
  .action(async (id) => {
    const api = getAPIClient();

    try {
      const highlight = await api.highlights.get.query({ highlightId: id });
      if (getGlobalOptions().json) {
        printObject(highlight);
      } else {
        printHighlightCard(highlight);
      }
    } catch (error) {
      printErrorMessageWithReason(
        `Failed to get highlight with id "${id}"`,
        error as object,
      );
    }
  });

highlightsCmd
  .command("delete")
  .description("delete a highlight")
  .argument("<id>", "the id of the highlight")
  .action(async (id) => {
    const api = getAPIClient();

    await api.highlights.delete
      .mutate({ highlightId: id })
      .then(() => console.log(`Successfully deleted highlight "${id}"`))
      .catch(printError(`Failed to delete highlight with id "${id}"`));
  });

highlightsCmd
  .command("create")
  .description("create an annotation at offsets in saved content")
  .requiredOption("--bookmark <id>", "bookmark id")
  .requiredOption("--start <offset>", "start offset", integer)
  .requiredOption("--end <offset>", "end offset", integer)
  .requiredOption("--text <text>", "selected text")
  .option(
    "--color <color>",
    "highlight color",
    choice(["yellow", "red", "green", "blue"] as const),
    "yellow",
  )
  .option("--note <note>", "annotation note")
  .option("--context-before <text>", "text immediately before the selection")
  .option("--context-after <text>", "text immediately after the selection")
  .option(
    "--transcript-revision <revision>",
    "revision for transcript highlights",
    integer,
  )
  .action(async (opts) => {
    if (opts.end <= opts.start)
      throw new Error("--end must be greater than --start");
    printObject(
      await getAPIClient().highlights.create.mutate({
        bookmarkId: opts.bookmark,
        startOffset: opts.start,
        endOffset: opts.end,
        text: opts.text,
        color: opts.color,
        note: opts.note ?? null,
        contextBefore: opts.contextBefore ?? null,
        contextAfter: opts.contextAfter ?? null,
        transcriptRevision: opts.transcriptRevision ?? null,
      }),
    );
  });

highlightsCmd
  .command("update")
  .argument("<id>", "highlight id")
  .option(
    "--color <color>",
    "highlight color",
    choice(["yellow", "red", "green", "blue"] as const),
  )
  .option("--note <note>", "annotation note")
  .option("--clear-note", "remove the annotation note")
  .action(async (id, opts) => {
    if (opts.note !== undefined && opts.clearNote)
      throw new Error("Choose --note or --clear-note");
    if (!opts.color && opts.note === undefined && !opts.clearNote)
      throw new Error("Provide --color, --note, or --clear-note");
    printObject(
      await getAPIClient().highlights.update.mutate({
        highlightId: id,
        color: opts.color,
        note: opts.clearNote ? null : opts.note,
      }),
    );
  });

highlightsCmd
  .command("search")
  .argument("<query>", "highlight search text")
  .option("--limit <limit>", "results per page (1 to 100)", pageSize, 20)
  .option("--cursor <cursor>", "previous nextCursor")
  .option("--all", "fetch every page")
  .action(async (query, opts) => {
    const api = getAPIClient();
    let response = await api.highlights.search.query({
      text: query,
      limit: opts.limit,
      cursor: decodeCursor(opts.cursor),
    });
    const highlights = [...response.highlights];
    while (opts.all && response.nextCursor) {
      response = await api.highlights.search.query({
        text: query,
        limit: opts.limit,
        cursor: response.nextCursor,
      });
      highlights.push(...response.highlights);
    }
    printObject({
      highlights,
      nextCursor: opts.all ? undefined : encodeCursor(response.nextCursor),
    });
  });
