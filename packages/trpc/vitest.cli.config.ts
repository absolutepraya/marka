import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeConfig } from "vitest/config";
import base from "./vitest.config";

const directory = mkdtempSync(join(tmpdir(), "marka-cli-tests-"));
process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
export default mergeConfig(base, {
  test: {
    include: ["cli.integration.ts"],
    env: { DATA_DIR: directory, NO_COLOR: "false" },
    testTimeout: 180_000,
  },
});
