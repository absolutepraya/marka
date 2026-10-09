import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validatePublishedVersion(metadata, decision) {
  if (
    metadata.name !== "@absolutepraya/marka" ||
    metadata.version !== decision.version ||
    metadata.gitHead !== decision.target
  ) {
    throw new Error(
      "Published CLI version does not match the reserved release commit",
    );
  }
  if (
    metadata.bin?.marka !== "dist/index.mjs" ||
    metadata.bin?.karakeep !== "dist/index.mjs"
  ) {
    throw new Error(
      "Published CLI does not provide both expected executable names",
    );
  }
}
async function main() {
  const decision = JSON.parse(
    readFileSync("cli-release-decision.json", "utf8"),
  );
  const verify = process.argv.includes("--verify");
  const attempts = verify ? 31 : 1;
  let exists = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(
      `https://registry.npmjs.org/@absolutepraya%2fmarka/${decision.version}`,
    );
    if (response.ok) {
      validatePublishedVersion(await response.json(), decision);
      exists = true;
      if (!verify) break;

      // npm can expose the version endpoint before the package document used
      // by npm install. Wait for both before checking the installed executable.
      const packageResponse = await fetch(
        "https://registry.npmjs.org/@absolutepraya%2fmarka",
      );
      if (packageResponse.ok) {
        const metadata = await packageResponse.json();
        const version = metadata.versions?.[decision.version];
        if (version) {
          validatePublishedVersion(version, decision);
          const installResponse = await fetch(
            "https://registry.npmjs.org/@absolutepraya%2fmarka",
            { headers: { Accept: "application/vnd.npm.install-v1+json" } },
          );
          if (installResponse.ok) {
            const installMetadata = await installResponse.json();
            const installVersion = installMetadata.versions?.[decision.version];
            if (installVersion) {
              // Abbreviated install metadata omits gitHead. Match its tarball
              // integrity to the fully validated version instead.
              if (
                !version.dist?.integrity ||
                installVersion.dist?.integrity !== version.dist.integrity
              )
                throw new Error("npm install metadata has different integrity");
              break;
            }
          } else if (installResponse.status !== 404) {
            throw new Error(
              `npm install metadata check failed: HTTP ${installResponse.status}`,
            );
          }
        }
      } else if (packageResponse.status !== 404) {
        throw new Error(
          `npm package check failed: HTTP ${packageResponse.status}`,
        );
      }
      exists = false;
    } else if (response.status !== 404) {
      throw new Error(`npm registry check failed: HTTP ${response.status}`);
    }
    if (verify && attempt < attempts - 1) {
      console.log(
        "Waiting for npm publication processing and install metadata",
      );
      await new Promise((resolve) => setTimeout(resolve, 20000));
    }
  }
  if (verify && !exists)
    throw new Error("Published CLI version is not visible on npm");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `exists=${exists}\n`);
  console.log(
    exists
      ? "Reserved CLI version is published and matches its commit"
      : "Reserved CLI version has not been published",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
