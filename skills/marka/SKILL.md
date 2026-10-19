---
name: marka
description: Use when a user asks to connect to Marka, search or save bookmarks, organize them with lists and tags, or export, restore, or migrate a bookmark library.
---

# Marka

Use the official CLI or REST API. Use the `marka` command. The `karakeep` alias and `KARAKEEP_` environment names remain supported for compatibility.

## Connect to an instance

Installing this skill provides instructions only. It does not install the CLI or authenticate to an account.

1. Check for the CLI with `command -v marka` and inspect `marka --version` and `marka --help`. The current CLI requires Node.js 22 or newer. If it is missing and CLI use is appropriate, install it with `npm install --global @absolutepraya/marka`.
2. Create an API key in the instance UI under **Settings > API Keys**.
3. In a private local terminal, run `marka auth init`. Enter the instance URL, such as `https://marka.example.com`, and the API key. Do not append `/api/v1`. An installation base path is supported. Supply an explicit absolute HTTP(S) URL without embedded credentials, a query string, or a fragment; trailing slashes are normalized. Never rely on an automatic remote default. The CLI stores the config in `$XDG_CONFIG_HOME/karakeep/config.json`, or `~/.config/karakeep/config.json` when `XDG_CONFIG_HOME` is unset, with file mode `0600`.
4. Verify access with `marka whoami`.

For unattended agents, configure `KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR` in the agent host's secrets or environment. The address is the instance URL, including any installation base path. Never request a key in chat, print or log it, pass it as an argument, or save it in a skill or project file. Use custom names such as `MARKA_API_KEY` or `MARKA_URL` only when the user confirms they are set; otherwise use the official names. If access is not configured, tell the user Marka is not authenticated, explain the local setup, and stop before authenticated requests. If `marka whoami` or an API request returns an authentication error or HTTP 401, tell the user the credentials were rejected, ask them to check the instance URL and update the key locally, and verify again before continuing. Treat network errors and HTTP 403 as connection or permission problems rather than missing credentials. `whoami` requires `users:read`; a bookmarks-only key may still allow bookmark reads.

Check command help before using newer functionality. The portable transfer and output contracts below require a compatible CLI build; installing this skill does not upgrade the npm package or the servers. If a command is absent or the server reports an unsupported transfer version, stop that operation and explain the required upgrade. Do not silently fall back to an older migration or dump workflow with weaker preservation guarantees.

## Search and organize

Honor a requested interface such as CLI or HTTP. Otherwise prefer the CLI. Check `marka --help` for current options. Common commands:

```bash
marka --json bookmarks search "rust is:fav" --limit 10
marka --json lists list
marka --json tags list
marka bookmarks add --link "https://example.com" --title "Example"
```

Search supports plain text and filters such as `is:fav`, `is:archived`, `#tag`, `list:"Reading"`, `url:github.com`, and `after:2026-01-01`.

Before saving, search for the URL. Reuse a matching bookmark's ID instead of creating a duplicate. Prefer a direct page for the specific product or place over a social post or profile, and retain the post as note context when useful. For a list, use the exact ID from `marka --json lists list`; ask if its name is ambiguous. Use `--tag-name` and `--list-id` for tags and list placement.

For text bookmarks, prefer `bookmarks add --text` and choose `--format markdown|plain` when supported by the installed CLI. The legacy `add --note` creates a text body; `bookmarks update --note` edits metadata instead. Check command help before using newer commands on an older CLI.

For requested body edits, read `bookmarks content-access ID` before reading the body with `bookmarks get ID --include-content`. Retain that `textVersion` for `bookmarks edit-content ID --base-version VERSION` with exactly one of `--text`, `--file`, or `--stdin`. Transcript edits similarly retain the revision from `transcripts get` and supply `--expected-revision` to `transcripts update`. On a conflict, preserve the draft and ask the user how to proceed; never fetch a newer revision just to bypass the conflict. List sharing roles do not grant content editing rights. Inviting collaborators sends an invitation and requires an explicit sharing request.

## Machine-readable results

Use `--json` for automation. Successful data commands emit one JSON value on stdout; commands with no result emit `{"success":true}`. Prompts, progress, and diagnostics use stderr. Action failures emit JSON error objects on stderr and exit unsuccessfully. Help/version output and Commander usage/parse errors retain conventional text, so stderr is not necessarily one JSON document.

Inspect the exit status as well as the output. Partial bookmark additions can return successful records on stdout while still exiting unsuccessfully. Bookmark creation returns its final state after tag/list follow-ups succeed; a failed follow-up can leave the bookmark created. Read back affected IDs and memberships before retrying an ambiguous or failed write.

Only make requested changes. Do not infer deletion, archiving, or reorganization. After a write, report its result and ID without credentials.

## Portable export, restore, and migration

Use these commands only for a requested library copy or recovery. Check `dump --help`, `restore --help`, and `migrate --help` on the installed CLI before proceeding. Exports require a source server supporting bookmark transfer version 1; restores require that support on the destination; live migration requires it on both. Export requires a `tar` executable. Restore parses the archive once, rejects links, duplicates, and unexpected paths, and stages files under generated names in a private temporary directory removed afterward.

```bash
marka --json dump --output library.tar.gz
marka --json restore library.tar.gz --yes
marka --json migrate --dest-server https://destination.example.com --yes
```

The restore example uses the normal configured connection as its destination. Select and verify the destination URL and its corresponding API key before running it. Changing `--server-addr` alone does not select a different key. Migration uses the normal connection as its source and reads the destination key from `KARAKEEP_DEST_API_KEY`; configure that variable through the host's secrets or environment. Never pass either key on the command line. Use `--yes` only after the user has requested the destination writes and the destination has been verified.

- Version 2 `karakeep.dump` archives preserve owned bookmarks, text format, metadata, your own highlights/progress, source and working transcripts with revisions, and referenced primary files, attachments, cached HTML, page archives, and caption sources. Included account data covers lists/membership, tags, feeds, prompts, rules, and preferences. Destination IDs are fresh; existing saved URLs are refused.
- Restore validates schemas, counts, required file sizes, and SHA-256 checksums before its first server write. Each archive member is limited to 256 MiB. Historical version 1 dumps cannot be restored. Export publishes the archive atomically with mode `0600`; a failed export does not replace the destination archive. Treat archives as private library data.
- Credentials, API keys, other users' bookmarks, feed import history, live jobs, search indexes, derived processing metadata, avatars, unattached files, and server backup archives are excluded. Sharing, invitations, and content-edit grants are reference-only and do not grant access or send invitations. Secret-protected webhooks are reference-only and are not recreated; live migration requires `--exclude-webhooks` when such webhooks exist.
- Inspect `--exclude-*` options and the returned exclusions. `--exclude-assets` also skips asset bookmarks requiring primary files. Rules and curated-tag preferences need their referenced categories; missing mappings fail. Existing destination list metadata and visibility remain when a matching list is reused.
- A full export needs read access to every included resource. Imports need corresponding write access; file uploads require both `assets:readwrite` and `bookmarks:readwrite`. Ownership checks and storage/bookmark quotas still apply. Do not interpret permission failures as empty or successfully copied data.
- Individual bookmark imports are transactional, but the entire account operation can partially complete. Earlier records or metadata may remain after a failure; tag/list follow-ups can fail after a bookmark is created. Inspect exit status, `success`, failure counts, and affected destination records before retrying. Repeating text-bookmark imports creates additional records. Migration distinguishes `migrated`, `excluded`, and `failed`; report those counts separately.

Avoid editing the source during a copy when consistency matters. These archives are portable library exports. Use the operator's database/assets backup workflow for complete instance recovery. See the [CLI contract](https://github.com/absolutepraya/marka/blob/main/apps/cli/README.md) for the full preservation and compatibility details.

## REST API

Use Bearer authentication and the base path `/api/v1`. Common routes:

- Verify access: `GET /users/me`.
- Read list names and IDs: `GET /lists`, which returns `lists[]` entries with `id` and `name`.
- Search: `GET /bookmarks/search?q=<URL-encoded-query>`. Results are paginated; follow `nextCursor` with the `cursor` query parameter when needed.
- Check an exact URL before saving: `GET /bookmarks/check-url?url=<URL-encoded-url>`. The response is `{"bookmarkId":"<id>"}` when it already exists, or `{"bookmarkId":null}` when it does not. URL comparison ignores hash fragments and trailing slashes.
- Create a link when the check returns `null`: `POST /bookmarks` with `{"type":"link","url":"<URL>"}`. Use the returned `id`.
- Add a bookmark to a list: `PUT /lists/{listId}/bookmarks/{bookmarkId}`. A `204` response confirms success.

To verify the connection without putting the key in a command argument:

```bash
printf 'header = "Authorization: Bearer %s"\n' "$KARAKEEP_API_KEY" |
  curl --config - --fail-with-body --silent --show-error \
    "${KARAKEEP_SERVER_ADDR%/}/api/v1/users/me"
```

To check an exact URL before saving it, let curl encode the query parameter:

```bash
BOOKMARK_URL='https://example.com'
printf 'header = "Authorization: Bearer %s"\n' "$KARAKEEP_API_KEY" |
  curl --config - --fail-with-body --silent --show-error --get \
    --data-urlencode "url=$BOOKMARK_URL" \
    "${KARAKEEP_SERVER_ADDR%/}/api/v1/bookmarks/check-url"
```

Use the [API reference](https://github.com/absolutepraya/marka/tree/main/docs/docs/api) for other paths, parameters, and request schemas. Do not guess fields or retry a write after an ambiguous response without checking whether it succeeded.
