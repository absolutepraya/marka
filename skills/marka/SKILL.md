---
name: marka
description: Use when a user asks to connect to Marka, search or save bookmarks, or organize them with lists and tags.
---

# Marka

Use the official CLI or REST API. Use the `marka` command. The `karakeep` alias and `KARAKEEP_` environment names remain supported for compatibility.

## Connect to an instance

Installing this skill provides instructions only. It does not install the CLI or authenticate to an account.

1. Check for the CLI with `command -v marka`. If it is missing and CLI use is appropriate, install it with `npm install --global @absolutepraya/marka`.
2. Create an API key in the instance UI under **Settings > API Keys**.
3. In a private local terminal, run `marka auth init`. Enter the instance origin, such as `https://marka.example.com`, and the API key. Do not append `/api/v1`. The CLI stores the config in `$XDG_CONFIG_HOME/karakeep/config.json`, or `~/.config/karakeep/config.json` when `XDG_CONFIG_HOME` is unset, with file mode `0600`.
4. Verify access with `marka whoami`.

For unattended agents, configure `KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR` in the agent host's secrets or environment. The address is the instance origin. Never request a key in chat, print or log it, pass it as an argument, or save it in a skill or project file. Use custom names such as `MARKA_API_KEY` or `MARKA_URL` only when the user confirms they are set; otherwise use the official names. If access is not configured, tell the user Marka is not authenticated, explain the local setup, and stop before authenticated requests. If `marka whoami` or an API request returns an authentication error or HTTP 401, tell the user the credentials were rejected, ask them to check the instance origin and update the key locally, and verify again before continuing. Treat network errors and HTTP 403 as connection or permission problems rather than missing credentials.

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

Inspect the CLI exit status as well as its output. A multi-bookmark operation can partly succeed and still exit unsuccessfully. Read back the affected IDs before retrying an ambiguous or failed write.

Only make requested changes. Do not infer deletion, archiving, or reorganization. After a write, report its result and ID without credentials.

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
