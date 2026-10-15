import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export async function copyDevState(source, target) {
  if (existsSync(target)) throw new Error("Destination state already exists");
  await mkdir(dirname(target), { recursive: true });
  const staging = await mkdtemp(join(dirname(target), ".state-copy-"));
  try {
    const databaseNames = ["db.db", "queue.db"];
    for (const name of databaseNames) {
      const databasePath = join(source, name);
      if (!existsSync(databasePath)) continue;
      const database = new DatabaseSync(databasePath, { readOnly: true });
      try {
        await backup(database, join(staging, name));
      } finally {
        database.close();
      }
      const snapshot = new DatabaseSync(join(staging, name), {
        readOnly: true,
      });
      try {
        if (snapshot.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
          throw new Error("SQLite snapshot failed integrity validation");
        }
      } finally {
        snapshot.close();
      }
    }
    // SQLite owns its snapshot. Never copy live database files or sidecars.
    const copied = spawnSync(
      "rsync",
      [
        "-a",
        ...databaseNames.flatMap((name) =>
          ["", "-wal", "-shm", "-journal"].map(
            (suffix) => `--exclude=/${name}${suffix}`,
          ),
        ),
        source + "/",
        staging + "/",
      ],
      { stdio: "inherit" },
    );
    if (copied.error || copied.status !== 0)
      throw new Error("State asset copy failed");
    // Failed copies must not look like existing, reusable local state on rerun.
    if (existsSync(target))
      throw new Error("Destination state appeared during copy");
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 4)
    throw new Error("Usage: copy-dev-state.mjs <source> <target>");
  await copyDevState(resolve(process.argv[2]), resolve(process.argv[3]));
}
