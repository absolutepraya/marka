# Marka CLI

The npm package is `@absolutepraya/marka`. Its primary command is `marka`;
`karakeep` remains an alias for existing scripts.

## Install and connect

Requires Node.js 22 or newer. Install from npm:

```bash
npm install --global @absolutepraya/marka
marka auth init
marka whoami
```

Create a key under **Settings > API Keys** in your Marka instance. Enter the
instance URL without `/api/v1` during authentication setup. A server address is
required; the CLI never selects a remote service automatically. HTTP(S) URLs
may include an installation base path. Trailing slashes are normalized;
credentials, query strings, and fragments in the server URL are rejected.

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

## Portable export, restore, and migration

These commands require servers supporting bookmark transfer version 1. Upgrade
both servers before a live migration. They preserve owned library data and use
fresh destination IDs. They do not overwrite an existing saved URL.

```bash
marka --json dump --output library.tar.gz
marka --server-addr https://destination.example.com --json restore library.tar.gz --yes
marka --json migrate --dest-server https://destination.example.com --yes
```

Restore uses the normal configured API key. `--server-addr` changes only the
URL, so configure `KARAKEEP_API_KEY` through the environment or a secret store
with the destination account's key before restoring to another instance/account.
Verify the destination connection before using `--yes`.

For migration, set `KARAKEEP_DEST_API_KEY` in your environment or secret store.
The `--dest-api-key` flag also works. The source uses the normal CLI config or
`KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR`. Avoid putting keys in shell history.

The version 2 `karakeep.dump` archive contains:

- `manifest.json`: format version, counts, explicit exclusions, and SHA-256
  checksums for binary files.
- `account.json`: SuperJSON-serialized list definitions, bookmark membership,
  tags, feeds, prompts, rules, preferences, and reference sharing metadata.
- `bookmarks/state.jsonl`: a SuperJSON snapshot per owned bookmark, including
  text format, metadata, annotations, reading progress, and source/working
  transcript records. Content-edit permissions are included for reference.
- `assets/`: primary files, attachments, cached HTML, page archives, and caption
  sources referenced by the exported bookmarks.

Restore verifies record counts, schemas, file sizes, and checksums before its
first server write. It parses the archive once and stages regular files under
generated names in a private temporary directory, removed after the operation.
Archive-supplied paths are never used as filesystem destinations. Links,
duplicate members, and unexpected paths are rejected. A tar executable is
required for export.
Each archive member is limited to 256 MiB; export refuses a larger member.
Version 1 dumps remain readable as historical exports but cannot be passed to
`restore`, because they omit data required by this preservation contract.

Exports include only owned bookmarks and your own annotations/progress.
Credentials, API keys, other users' bookmarks, feed import history, live jobs,
search indexes, derived processing metadata, avatars, unattached files, and
server backup archives are excluded. Sharing and invitation metadata are saved
for reference; restore does not grant access, reactivate invitations, or send
invitation email. Webhooks with secret tokens are saved for reference and are
not recreated. Live migration requires `--exclude-webhooks` when such webhooks
exist, so you can configure their secrets explicitly on the destination.

Use the `--exclude-*` options shown by `dump --help` and `migrate --help` to choose
what to copy. `--exclude-assets` also skips asset bookmarks, which need their
primary files. Rules and curated-tag preferences require their referenced
categories; missing mappings fail explicitly. Existing destination list metadata
and visibility are retained when a matching list is reused.

Each bookmark import validates ownership of its uploaded files and commits its
body, transcripts, attachments, annotations, and progress together. The complete
account operation is not one transaction: earlier records or metadata can remain
when a later operation fails. A failed tag/list follow-up can also leave the
new bookmark in place. Inspect the failure summary before retrying; repeated
text-bookmark imports create new records. Live exports read a running library,
so avoid editing the source during a copy when a consistent snapshot matters.
Use the operator's database/assets backup workflow for complete instance recovery.

A full export needs read access to bookmarks, highlights, assets, lists, tags,
feeds, prompts, rules, webhooks, and users. Imports need write access for the
included resources. File uploads additionally require both `assets:readwrite`
and `bookmarks:readwrite`; normal ownership and storage/bookmark quotas apply.
`whoami` itself requires `users:read`, even when a bookmarks-only key works for
bookmark reads.

## Output contract

With `--json`, successful commands emit one JSON value to stdout. Commands with
no result emit `{"success":true}`. Progress and diagnostics use stderr. Action
failures use a JSON error object on stderr and a nonzero exit status; partial
bookmark additions can still return their successful records on stdout.
Help/version flags keep their text output. Commander usage/parse errors may print
plain diagnostic text with empty stdout.
Always inspect the exit status before reporting success.

Migration returns completed bookmarks (`migrated`), intentionally skipped asset
bookmarks (`excluded`), and failed operations (`failed`). Export/restore return structured summaries. An export failure does not
replace the destination archive. Archives are published atomically with mode
`0600` after all supported data has been collected.

## Build locally

```bash
pnpm --filter @absolutepraya/marka build
node apps/cli/dist/index.mjs --help
pnpm test:cli-package
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
