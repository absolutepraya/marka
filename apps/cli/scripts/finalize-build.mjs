import { chmodSync, copyFileSync } from "node:fs";

copyFileSync(
  new URL("../../../LICENSE", import.meta.url),
  new URL("../dist/LICENSE", import.meta.url),
);
if (process.platform !== "win32") {
  chmodSync(new URL("../dist/index.mjs", import.meta.url), 0o755);
}
