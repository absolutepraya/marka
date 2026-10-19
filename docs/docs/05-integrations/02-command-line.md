# Command Line Tool (CLI)

The npm package `@absolutepraya/marka` provides the `marka` command. The
`karakeep` executable is a compatibility alias. Node.js 22 or newer is required.

## Install and connect

```bash
npm install --global @absolutepraya/marka
marka auth init
marka whoami
```

Create a key under **Settings > API Keys** in your instance. Enter your instance
URL, such as `https://marka.example.com`, without `/api/v1`. A server address is
required. The CLI never defaults to a remote service. Trailing slashes are
normalized, and credentials, query strings, and fragments in URLs are rejected.

Interactive setup hides API-key input. Configuration remains in
`$XDG_CONFIG_HOME/karakeep/config.json` or `~/.config/karakeep/config.json` with
mode `0600`. It stores the key without encryption. Unattended agents can use
`KARAKEEP_SERVER_ADDR` and `KARAKEEP_API_KEY` through environment/secret settings.
Avoid putting keys in command-line arguments or shell history.

## Library operations

```bash
marka --help
marka bookmarks --help
marka --json bookmarks list --all
marka --json bookmarks search 'tag:reading'
marka bookmarks add --link https://example.com --tag-name reading
marka bookmarks add --text 'Saved body' --format plain
marka lists --help
marka highlights --help
marka transcripts --help
marka admin --help
```

Commands support links, text/Markdown, image/PDF/audio/video bookmarks, lists,
tags, highlights, working transcripts, reading progress, and selected admin
operations. API scopes and ownership still apply. List editing does not grant
text-content editing; collaborative edits require an explicit content grant and
the previously read canonical revision.

Use `--json` for one JSON result on stdout. Successful commands with no result
emit `{"success":true}`. Diagnostics and progress use stderr; failures return a
nonzero exit status. Help/version flags keep text output. CLI usage/parse errors
may have plain stderr and no stdout.

## Portable library archives

```bash
marka --json dump --output library.tar.gz
marka --server-addr https://destination.example.com --json restore library.tar.gz --yes
```

Restore still uses the normal configured API key. Changing `--server-addr`
changes only the URL. Set `KARAKEEP_API_KEY` through the environment or a secret
store to the destination account's key, then verify that connection before
running restore with `--yes`.

Version 2 archives preserve owned bookmarks, text format, metadata, tags,
manual list membership, highlights, reading progress, transcripts, and referenced
binary assets, including cached HTML and caption files. Lists, feeds, prompts,
rules, and preferences are included. Restore checks schemas, counts, file sizes,
and SHA-256 checksums before writing. Both CLI and server must support bookmark
transfer version 1; export requires a tar executable. Restore parses an archive
once into a private temporary staging directory with generated filenames and
rejects links, duplicate members, and unexpected paths. Staging is removed
after the operation. Individual archive members
cannot exceed 256 MiB. Historical version 1 dumps cannot be restored by this
command because they lack the required data.

These archives are portable library exports. They exclude credentials, API keys,
other users' bookmarks, live sharing permissions and invitations, feed import
history, background jobs/search indexes, derived processing metadata, unattached
files, avatars, and server backup archives. Sharing metadata and secret-protected
webhook configuration are retained for reference and are not reactivated. Use an
operator database/assets backup for complete instance recovery.

Imports create new IDs and refuse to overwrite existing saved URLs. Each
bookmark is imported transactionally, but the account operation can partially
complete. Inspect summaries before retrying; repeating text imports creates new
records. Avoid editing the source during an export when consistency matters.

## Live migration

Configure `KARAKEEP_DEST_API_KEY` in a secret/environment setting, then run:

```bash
marka --json migrate --dest-server https://destination.example.com --yes
```

The source uses normal CLI credentials. Both servers must support the new
transfer API. Read and write scopes for the included resources are required;
uploads also need `assets:readwrite` and `bookmarks:readwrite`. A full export
requires `highlights:read` even when no highlights exist. `whoami` requires
`users:read`.

Use `dump --help` and `migrate --help` for exclusions. Secret-protected webhooks
require `--exclude-webhooks` for live migration and explicit destination setup.
Excluded dependencies of rules or curated-tag preferences fail explicitly.
Asset-transfer and permission failures return nonzero status and are never
reported as successful skips.

The full contract and examples are maintained in
[the CLI README](https://github.com/absolutepraya/marka/blob/main/apps/cli/README.md).
