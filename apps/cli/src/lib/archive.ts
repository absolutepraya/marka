import { createReadStream, openSync, closeSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Parser } from "tar";
import type { ReadEntry } from "tar";

// All archive members are checked before any restore writes. Keep export and
// restore bounds identical so a complete export is accepted by the reader.
export const MAX_ARCHIVE_MEMBER_BYTES = 256 * 1024 * 1024;

// Read the source archive once. Keep bounded members under generated names in
// a private directory so validation and import use the same bytes, even if the
// original archive changes. Never extract an archive-supplied filesystem path.
export async function readPortableArchive(archive: string) {
  const directory = await mkdtemp(join(tmpdir(), "marka-restore-"));
  const files = new Map<
    string,
    { path: string; size: number; sha256: string }
  >();
  const seen = new Set<string>();
  const descriptors = new Set<number>();
  const source = createReadStream(archive);
  const parser = new Parser({ strict: true });
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    await new Promise<void>((resolve, reject) => {
      parser.on("error", reject);
      parser.on("end", resolve);
      source.on("error", (error) => parser.abort(error));
      parser.on("ignoredEntry", () =>
        parser.abort(new Error("Unsupported archive member")),
      );
      parser.on("entry", (entry: ReadEntry) => {
        try {
          if (seen.has(entry.path)) throw new Error("Duplicate archive member");
          seen.add(entry.path);
          if (
            entry.type === "Directory" &&
            /^(assets|bookmarks)\/$/.test(entry.path) &&
            entry.size === 0
          ) {
            entry.resume();
            return;
          }
          if (
            entry.type !== "File" ||
            !/^(manifest\.json|account\.json|bookmarks\/state\.jsonl|assets\/[A-Za-z0-9_-]+)$/.test(
              entry.path,
            )
          )
            throw new Error("Unexpected archive member type or path");
          if (
            !Number.isSafeInteger(entry.size) ||
            entry.size < 0 ||
            entry.size > MAX_ARCHIVE_MEMBER_BYTES
          )
            throw new Error("Archive member exceeds the supported size limit");
          const path = join(directory, String(seen.size));
          const fd = openSync(path, "wx", 0o600);
          descriptors.add(fd);
          const hash = createHash("sha256");
          let size = 0;
          entry.on("error", (error) => parser.abort(error as Error));
          entry.on("end", () => {
            try {
              closeSync(fd);
              descriptors.delete(fd);
              if (size !== entry.size)
                throw new Error("Archive member size mismatch");
              files.set(entry.path, { path, size, sha256: hash.digest("hex") });
            } catch (error) {
              parser.abort(error as Error);
            }
          });
          entry.on("data", (chunk: Buffer) => {
            try {
              size += chunk.length;
              if (size > entry.size)
                throw new Error("Archive member size mismatch");
              hash.update(chunk);
              writeFileSync(fd, chunk);
            } catch (error) {
              parser.abort(error as Error);
            }
          });
        } catch (error) {
          parser.abort(error as Error);
        }
      });
      source.pipe(parser);
    });
    return {
      files,
      read: (name: string) => {
        const file = files.get(name);
        if (!file) throw new Error(`Missing archive member: ${name}`);
        return readFile(file.path);
      },
      dispose,
    };
  } catch (error) {
    for (const fd of descriptors) closeSync(fd);
    await dispose();
    throw error;
  } finally {
    source.destroy();
  }
}
