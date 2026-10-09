# Marka CLI

The npm package is `@absolutepraya/marka`. Its primary command is `marka`;
`karakeep` remains an alias for existing scripts.

## Install and connect

After the package has been published:

```bash
npm install --global @absolutepraya/marka
marka auth init
marka whoami
```

Create a key under **Settings > API Keys** in your Marka instance. Enter the
instance origin without `/api/v1` during authentication setup.

Configuration remains in `$XDG_CONFIG_HOME/karakeep/config.json` (or
`~/.config/karakeep/config.json`) for compatibility. The file has mode `0600`.
Existing `KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR` environment variables
remain supported. Keep API keys in local configuration or a secret store.
Interactive setup hides API-key input. When updating configuration, press Enter
at the key prompt to retain the existing key without displaying it.

`marka whoami` exits unsuccessfully when access cannot be verified. An
unauthorized response prompts you to check the instance address and API key.

## Build locally

```bash
pnpm --filter @absolutepraya/marka build
node apps/cli/dist/index.mjs --help
```

## Independent automatic releases

After successful push CI on `main`, `.github/workflows/cli.yml` compares the
built CLI and runtime package metadata with its last release. An unchanged
artifact skips publication, including unrelated web or documentation changes.
Changed artifacts get independent versions: features bump minor, breaking
changes bump major, and fixes or bundled dependency changes bump patch. The
first Marka CLI version is `0.1.0`; upstream `cli/v...` tags are ignored.
Scoped CLI commits support the existing `Release: major|minor|patch|none` footer
override; artifact equality still prevents unnecessary releases.

Release tags use `marka-cli/v<version>` and record the artifact fingerprint.
Versions are set in the workflow's temporary build manifest; contributors do
not bump the source manifest. A failed publication reserves its version, and a
retry verifies the build and reuses that version. Already published versions
must match the release commit and both executable aliases.

Manual dispatch on `main` defaults to a dry run and still requires successful
push CI on that exact commit. Dispatch with `dry_run=false` and `target` set to the reserved release
commit to retry a failed publication. Pending publications block new versions
until that reserved version is published. The workflow checks the installed npm executable after publishing.

## One-time npm setup

1. Sign into the npm account that owns `@absolutepraya` and publish the initial
   `@absolutepraya/marka` package from the reviewed, CI-approved release commit.
   Use the reserved version, or `0.1.0` before a tag has been reserved. Set the
   temporary package manifest's `gitHead` to that commit and build before
   publishing. This initial publication requires npm login and any account 2FA.
2. In the package's npm settings, configure a GitHub Actions trusted publisher:
   owner `absolutepraya`, repository `marka`, workflow filename `cli.yml`.
   Allow direct publication. No GitHub environment is used by this workflow.
3. Run a manual dry run, then retry publication if an initial automatic attempt
   failed. Confirm the npm package and the workflow's installed-executable check.

New trusted publishers may show **Pending validation** with a deadline. Complete
a publication through the configured workflow before that deadline. The local
bootstrap publication does not validate OIDC, and a retry that skips an already
published version cannot validate it either. The next CLI change should release
through the workflow; confirm that npm marks the connection as validated.

Subsequent releases use npm OIDC with provenance and require no stored npm token.
The first publication and npm account configuration are external setup steps;
merging the workflow alone does not complete them. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers).
