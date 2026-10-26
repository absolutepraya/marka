import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function localCaptureUrl(value = "http://localhost:3000") {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Use a local development server URL for fixture capture.");
  }
  return url;
}

export async function writeBonesAtomically(target, bones) {
  const serialized = `${JSON.stringify(bones, null, 2)}\n`;
  const temporary = await mkdtemp(join(dirname(target), ".bones-"));
  try {
    const replacement = join(temporary, "capture.json");
    await writeFile(replacement, serialized);
    await rename(replacement, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
