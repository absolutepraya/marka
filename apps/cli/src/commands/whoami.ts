import { printErrorMessageWithReason, printObject } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Command } from "@commander-js/extra-typings";

export const whoamiCmd = new Command()
  .name("whoami")
  .description("returns info about the owner of this API key")
  .action(async () => {
    await getAPIClient()
      .users.whoami.query()
      .then(printObject)
      .catch((error: unknown) => {
        const unauthorized =
          error instanceof TRPCClientError &&
          error.data?.code === "UNAUTHORIZED";
        printErrorMessageWithReason(
          unauthorized
            ? "Marka authentication failed. Check your instance address and API key, then run marka auth init"
            : "Unable to verify the Marka connection",
          error instanceof Error ? error : new Error(String(error)),
        );
        process.exitCode = 1;
      });
  });
