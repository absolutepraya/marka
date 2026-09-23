import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const forbiddenReferences = [
  "karakeep.app",
  "cloud.karakeep.app",
  "try.karakeep.app",
  "localhostlabs.co.uk",
  "apps.apple.com",
  "play.google.com",
];

export function inspectPublicMarkup(markup, filePath = "<markup>") {
  const normalizedMarkup = markup.toLowerCase();
  const match = forbiddenReferences.find((reference) =>
    normalizedMarkup.includes(reference),
  );

  if (match) {
    throw new Error(`Forbidden public reference "${match}" in ${filePath}`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.error("Public site output verification is not implemented yet.");
  process.exitCode = 1;
}
