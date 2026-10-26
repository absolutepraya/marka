import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { localCaptureUrl, writeBonesAtomically } from "./skeleton-capture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");
const require = createRequire(join(web, "package.json"));
const baseUrl = localCaptureUrl(process.argv[2]);
const breakpoints = [320, 390, 640, 768, 1023, 1024, 1280, 1440, 1920];
const output = await mkdtemp(join(tmpdir(), "marka-admin-skeleton-"));

try {
  const cli = join(
    dirname(require.resolve("boneyard-js/package.json")),
    "bin/cli.js",
  );
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "build",
      new URL("/dev/boneyard", baseUrl).href,
      "--no-scan",
      "--force",
      "--wait",
      "1500",
      "--breakpoints",
      breakpoints.join(","),
      "--out",
      output,
    ],
    { cwd: web, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Boneyard capture failed.");

  const bones = JSON.parse(
    await readFile(join(output, "admin-stats.bones.json"), "utf8"),
  );
  for (const width of breakpoints) {
    const captured = bones.breakpoints?.[width];
    if (
      !captured?.bones?.length ||
      !(captured.width > 0) ||
      !(captured.height > 0)
    ) {
      throw new Error(
        `Missing or empty admin statistics capture at ${width}px.`,
      );
    }
  }
  // Import the JSON directly: no side-effect registry is needed for one view.
  await writeBonesAtomically(
    join(web, "components/admin/bones/admin-stats.bones.json"),
    bones,
  );
  console.log("Updated admin statistics skeleton from the local fixture.");
} finally {
  await rm(output, { recursive: true, force: true });
}
