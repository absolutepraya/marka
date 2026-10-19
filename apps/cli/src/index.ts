import { adminCmd } from "@/commands/admin";
import { authCmd } from "@/commands/auth";
import { bookmarkCmd } from "@/commands/bookmarks";
import { restoreCmd } from "@/commands/restore";
import { dumpCmd } from "@/commands/dump";
import { highlightsCmd } from "@/commands/highlights";
import { listsCmd } from "@/commands/lists";
import { migrateCmd } from "@/commands/migrate";
import { transcriptsCmd } from "@/commands/transcripts";
import { tagsCmd } from "@/commands/tags";
import { whoamiCmd } from "@/commands/whoami";
import { wipeCmd } from "@/commands/wipe";
import {
  getConfigPath,
  loadConfig,
  normalizeServerAddress,
} from "@/lib/config";
import {
  configureOutput,
  finishOutput,
  printStatusMessage,
} from "@/lib/output";
import type { RawGlobalOptions } from "@/lib/globals";
import { setGlobalOptions } from "@/lib/globals";
import { Command, Option } from "@commander-js/extra-typings";

function resolveGlobalOptions(opts: RawGlobalOptions) {
  if (opts.apiKey && opts.serverAddr) {
    return {
      apiKey: opts.apiKey,
      serverAddr: normalizeServerAddress(opts.serverAddr),
      json: opts.json,
    };
  }

  const config = loadConfig();
  const apiKey = opts.apiKey ?? config.apiKey;
  const serverAddr = opts.serverAddr ?? config.serverAddr;

  if (!apiKey) {
    throw new Error(
      `Marka is not authenticated. Run marka auth init, or configure KARAKEEP_API_KEY and KARAKEEP_SERVER_ADDR. Config: ${getConfigPath()}.`,
    );
  }
  if (!serverAddr) {
    throw new Error(
      "No Marka server configured. Run marka auth init or set KARAKEEP_SERVER_ADDR before using an API key.",
    );
  }

  return {
    apiKey,
    serverAddr: normalizeServerAddress(serverAddr),
    json: opts.json,
  };
}

function isAuthCommand(command: { name(): string; parent?: unknown }) {
  let current: { name(): string; parent?: unknown } | undefined = command;
  while (current) {
    if (current.name() === "auth") {
      return true;
    }
    current = current.parent as typeof current;
  }
  return false;
}

const program = new Command()
  .name("marka")
  .description("Manage your Marka library from the command line")
  .addOption(
    new Option("--api-key <key>", "the API key to interact with the API").env(
      "KARAKEEP_API_KEY",
    ),
  )
  .addOption(
    new Option(
      "--server-addr <addr>",
      "the address of the server to connect to",
    ).env("KARAKEEP_SERVER_ADDR"),
  )
  .addOption(new Option("--json", "to output the result as JSON"))
  .version(
    import.meta.env && "CLI_VERSION" in import.meta.env
      ? import.meta.env.CLI_VERSION
      : "0.0.0",
  );

program.addCommand(adminCmd);
program.addCommand(authCmd);
program.addCommand(bookmarkCmd);
program.addCommand(highlightsCmd);
program.addCommand(listsCmd);
program.addCommand(tagsCmd);
program.addCommand(transcriptsCmd);
program.addCommand(whoamiCmd);
program.addCommand(migrateCmd);
program.addCommand(wipeCmd);
program.addCommand(dumpCmd);
program.addCommand(restoreCmd);

program.hook("preAction", (_thisCommand, actionCommand) => {
  configureOutput(!!program.opts().json);
  if (isAuthCommand(actionCommand)) {
    return;
  }

  try {
    setGlobalOptions(resolveGlobalOptions(program.opts()));
  } catch (error) {
    program.error(error instanceof Error ? error.message : `${error}`);
  }
});

async function main() {
  await program.parseAsync();
  finishOutput();
}

void main().catch((error) => {
  printStatusMessage(false, error instanceof Error ? error.message : error);
  finishOutput();
});
