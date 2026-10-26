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
const names = [
  "admin-users",
  "admin-invites",
  "admin-connections",
  "admin-jobs",
  "usage-stats",
  "subscription",
  "subscription-price",
  "quota",
  "lists",
  "tags",
  "bookmark-tags",
  "feeds",
  "webhooks",
  "backups",
  "assets",
  "broken-links",
  "rules",
  "ai-prompts",
  "import-sessions",
  "import-detail",
  "import-results",
  "highlights",
  "highlight-cards",
];
const breakpoints = [320, 390, 640, 768, 1023, 1024, 1280, 1440, 1920];
const output = await mkdtemp(join(tmpdir(), "marka-surface-skeletons-"));
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
      new URL("/dev/boneyard/surfaces?capture=1", url).href,
      "--no-scan",
      "--force",
      "--wait",
      "2000",
      "--breakpoints",
      breakpoints.join(","),
      "--out",
      output,
    ],
    { cwd: web, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Surface skeleton capture failed.");
  const captures = await Promise.all(
    names.map(async (name) => {
      const bones = JSON.parse(
        await readFile(join(output, `${name}.bones.json`), "utf8"),
      );
      for (const width of breakpoints) {
        const sample = bones.breakpoints?.[width];
        if (
          !sample?.bones?.length ||
          !(sample.width > 0) ||
          !(sample.height > 0)
        )
          throw new Error(`Missing or empty ${name} capture at ${width}px.`);
      }
      return [name, bones];
    }),
  );
  // Validate the entire set before replacing any tracked capture.
  for (const [name, bones] of captures)
    await writeBonesAtomically(
      join(web, "components/loading-ui/bones", `${name}.bones.json`),
      bones,
    );
  console.log(
    `Updated ${names.length} surfaces at ${breakpoints.length} breakpoints.`,
  );
} finally {
  await rm(output, { recursive: true, force: true });
}
