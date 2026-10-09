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

## Commands aligned with Marka

Use `marka <command> --help` for arguments. API permissions still apply: list
editors can organize bookmarks, while editing shared text requires a separate
content edit grant and a current manual-list view path.

### Text bodies and metadata notes

```bash
marka bookmarks add --text "# Saved text" --format markdown
printf 'Plain text body' | marka bookmarks add --stdin --format plain
marka bookmarks update BOOKMARK_ID --note "Personal metadata note"
marka --json bookmarks content-access BOOKMARK_ID
marka --json bookmarks get BOOKMARK_ID --include-content
marka bookmarks edit-content BOOKMARK_ID --file draft.md --base-version 3
```

`add --text` creates a text bookmark body. The existing `add --note` is a legacy
alias for the same operation. `update --note` updates the bookmark's metadata
note, not its body. `--format` accepts `markdown` or `plain` when creating text.

For body edits, retain the `textVersion` from `content-access` before you read the
body. Supply that revision with the edited body; do not fetch a newer revision
just to force a stale draft through. `edit-content` accepts exactly one of
`--text`, `--file`, or `--stdin`. A stale revision fails without retrying or
silently overwriting the canonical body.

### Lists and sharing

```bash
marka lists update LIST_ID --name "Reading" --root
marka lists update LIST_ID --public
marka lists update LIST_ID --no-public
marka lists merge --source SOURCE_ID --target TARGET_ID
marka --json lists collaborators list LIST_ID
marka lists collaborators invite LIST_ID --email person@example.com --role viewer
marka lists collaborators update-role LIST_ID --user-id USER_ID --role editor
marka lists collaborators remove LIST_ID --user-id USER_ID
```

Merging retains the source unless `--delete-source` is supplied. Inviting a
collaborator sends an invitation. `--recursive` includes descendant lists.
List roles do not grant bookmark content editing.

### Highlights, transcripts, and progress

```bash
marka highlights create --bookmark BOOKMARK_ID --start 10 --end 20 --text "selection" --color yellow
marka highlights update HIGHLIGHT_ID --note "Annotation"
marka highlights update HIGHLIGHT_ID --clear-note
marka --json highlights search "selection" --limit 20
marka --json transcripts get BOOKMARK_ID
marka transcripts update BOOKMARK_ID --file transcript.txt --expected-revision 2
marka transcripts reset BOOKMARK_ID --yes
marka transcripts retry BOOKMARK_ID
marka --json bookmarks progress get BOOKMARK_ID
marka bookmarks progress set BOOKMARK_ID --offset 200 --percent 25
marka --json bookmarks check-url "https://example.com"
```

Highlight offsets and optional context must describe the actual saved content;
transcript highlights can specify `--transcript-revision`. `highlights list
--bookmark ID` returns all highlights for that bookmark and rejects pagination
flags. Global highlight lists and searches support pagination.

Transcript updates require the revision read with `get`. Reset discards working
edits and requires `--yes`. Reading progress applies to link and text bookmarks;
omitted optional progress fields are cleared, matching the app's API.

Page sizes accept integers from 1 to 100. Commands report failures on stderr and
exit unsuccessfully, including partial failures in multi-bookmark operations.
Use `--json` for machine-readable results and inspect the exit status before
reporting a successful write.

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
