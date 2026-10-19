import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

export interface CliConfig {
  apiKey?: string;
  serverAddr?: string;
}

export function normalizeServerAddress(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Server address must be an absolute HTTP(S) URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.href.includes("?") ||
    url.href.includes("#")
  ) {
    throw new Error(
      "Server address must be an HTTP(S) URL without credentials, query, or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export const zCliConfigFileSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    serverAddr: z.string().min(1).optional(),
  })
  .passthrough();

export type CliConfigFile = z.infer<typeof zCliConfigFileSchema>;

export function normalizeConfig(config: CliConfigFile): CliConfig {
  return {
    apiKey: config.apiKey,
    serverAddr: config.serverAddr,
  };
}

export function getConfigPath() {
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "karakeep", "config.json");
}

export function loadConfigFile(): CliConfigFile {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
    return zCliConfigFileSchema.parse(parsed);
  } catch {
    // Native JSON parse errors can include the stored key in their snippet.
    throw new Error(
      `Unable to read Marka config at ${configPath}. Run marka auth init --force to repair it.`,
    );
  }
}

export function loadConfig(): CliConfig {
  return normalizeConfig(loadConfigFile());
}
