import { integer, readText } from "@/lib/arguments";
import { printObject } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";

export const transcriptsCmd = new Command("transcripts").description(
  "read and edit working transcripts",
);
transcriptsCmd
  .command("get")
  .argument("<bookmark-id>", "bookmark id")
  .action(async (id) =>
    printObject(await getAPIClient().transcripts.get.query({ bookmarkId: id })),
  );
transcriptsCmd
  .command("update")
  .argument("<bookmark-id>", "bookmark id")
  .option("--text <text>", "new working transcript")
  .option("--file <file>", "UTF-8 file containing the transcript")
  .option("--stdin", "read the transcript from stdin")
  .requiredOption(
    "--expected-revision <revision>",
    "revision from the transcript you edited",
    integer,
  )
  .action(async (id, opts) =>
    printObject(
      await getAPIClient().transcripts.update.mutate({
        bookmarkId: id,
        text: readText(opts),
        expectedRevision: opts.expectedRevision,
      }),
    ),
  );
transcriptsCmd
  .command("reset")
  .description("discard working edits and restore the source transcript")
  .argument("<bookmark-id>", "bookmark id")
  .requiredOption("--yes", "confirm discarding working edits")
  .action(async (id, opts) => {
    if (!opts.yes)
      throw new Error("--yes is required to discard working edits");
    printObject(
      await getAPIClient().transcripts.reset.mutate({ bookmarkId: id }),
    );
  });
transcriptsCmd
  .command("retry")
  .description("retry transcript acquisition")
  .argument("<bookmark-id>", "bookmark id")
  .action(async (id) =>
    printObject(
      await getAPIClient().transcripts.retry.mutate({ bookmarkId: id }),
    ),
  );
