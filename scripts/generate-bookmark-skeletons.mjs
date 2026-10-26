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
const url = localCaptureUrl(process.argv[2]);
const widths = [112, 144, 176, 208, 256, 320, 400, 560, 800, 1100, 1360];
const layouts = ["masonry", "grid", "list", "compact"];
const output = await mkdtemp(join(tmpdir(), "marka-bookmark-skeletons-"));
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
      new URL("/dev/boneyard/bookmarks?capture=1", url).href,
      "--no-scan",
      "--force",
      "--wait",
      "2000",
      "--breakpoints",
      "390,1440",
      "--out",
      output,
    ],
    { cwd: web, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Bookmark skeleton capture failed.");
  const captures = { mobile: {}, desktop: {} };
  for (const layout of layouts) {
    captures.mobile[layout] = {};
    captures.desktop[layout] = {};
    for (const width of widths) {
      const file = JSON.parse(
        await readFile(
          join(output, `bookmark-${layout}-${width}.bones.json`),
          "utf8",
        ),
      );
      for (const [mode, viewport] of [
        ["mobile", 390],
        ["desktop", 1440],
      ]) {
        const capture = file.breakpoints?.[viewport];
        if (
          !capture?.bones?.length ||
          capture.width !== width ||
          !(capture.height > 0)
        ) {
          throw new Error(
            `Missing or invalid ${mode} ${layout} capture at ${width}px.`,
          );
        }
        captures[mode][layout][width] = capture;
      }
    }
  }
  await writeBonesAtomically(
    join(web, "components/dashboard/bookmarks/bones/bookmark-cards.bones.json"),
    captures,
  );
  console.log("Updated bookmark skeletons from real card fixtures.");
} finally {
  await rm(output, { recursive: true, force: true });
}
