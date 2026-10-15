import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { copyDevState } from "./copy-dev-state.mjs";

test("copies committed WAL state with an active writer and preserves assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "marka-state-copy-"));
  const source = join(root, "source");
  const target = join(root, "target");
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(join(source, "assets", "preview.jpg"), "fixture image");
  const queue = new DatabaseSync(join(source, "queue.db"));
  queue.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE jobs(id INTEGER); INSERT INTO jobs VALUES(7)",
  );
  const writer = new DatabaseSync(join(source, "db.db"));
  try {
    writer.exec(
      "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE bookmarks(id INTEGER PRIMARY KEY, asset TEXT); INSERT INTO bookmarks VALUES(1, 'preview.jpg'); BEGIN IMMEDIATE; INSERT INTO bookmarks VALUES(2, 'uncommitted.jpg');",
    );
    assert.ok(existsSync(join(source, "db.db-wal")));
    await copyDevState(source, target);
    const snapshot = new DatabaseSync(join(target, "db.db"));
    try {
      assert.equal(
        snapshot.prepare("PRAGMA quick_check").get().quick_check,
        "ok",
      );
      assert.deepEqual(
        snapshot
          .prepare("SELECT * FROM bookmarks")
          .all()
          .map((row) => ({ ...row })),
        [{ id: 1, asset: "preview.jpg" }],
      );
    } finally {
      snapshot.close();
    }
    for (const suffix of ["-wal", "-shm", "-journal"])
      assert.equal(existsSync(join(target, "db.db" + suffix)), false);
    assert.equal(
      await readFile(join(target, "assets", "preview.jpg"), "utf8"),
      "fixture image",
    );
    const queueSnapshot = new DatabaseSync(join(target, "queue.db"));
    try {
      assert.equal(queueSnapshot.prepare("SELECT id FROM jobs").get().id, 7);
    } finally {
      queueSnapshot.close();
    }
    assert.equal(existsSync(join(target, "queue.db-wal")), false);
    assert.equal(existsSync(join(target, "queue.db-shm")), false);
    writer.exec("ROLLBACK");
    assert.equal(
      writer.prepare("SELECT COUNT(*) AS n FROM bookmarks").get().n,
      1,
    );
    await assert.rejects(copyDevState(source, target), /already exists/);
  } finally {
    writer.close();
    queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed snapshot leaves no destination or staging state to reuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "marka-state-copy-failure-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "db.db"), "not a SQLite database");
    await assert.rejects(copyDevState(source, join(root, "target")));
    assert.deepEqual(await readdir(root), ["source"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
