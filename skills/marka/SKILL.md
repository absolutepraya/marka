---
name: marka
description: Use when a user asks to connect to Marka, search or save bookmarks, or organize them with lists and tags.
---

# Marka

Use the official CLI or REST API. The executable and environment names retain `karakeep` and `KARAKEEP_` for compatibility.

## Connect to an instance

Installing this skill provides instructions only. It does not install the CLI or authenticate to an account.

1. Check for the CLI with `command -v karakeep`. If it is missing and CLI use is appropriate, install it with `npm install --global @karakeep/cli`.
2. Create an API key in the instance UI under **Settings > API Keys**.
3. In a private local terminal, run `karakeep auth init`. Enter the instance origin, such as `https://marka.example.com`, and the API key. Do not append `/api/v1`. The CLI stores the config in `$XDG_CONFIG_HOME/karakeep/config.json`, or `~/.config/karakeep/config.json` when `XDG_CONFIG_HOME` is unset, with file mode `0600`.
4. Verify access with `karakeep whoami`.

For unattended agents, configure `KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR` in the agent host's secrets or environment. The address is the instance origin. Never request a key in chat, print or log it, pass it as an argument, or save it in a skill or project file. Use custom names such as `MARKA_API_KEY` or `MARKA_URL` only when the user confirms they are set; otherwise use the official names. If access is not configured, explain the local setup and stop before authenticated requests.

## Search and organize

Honor a requested interface such as CLI or HTTP. Otherwise prefer the CLI. Check `karakeep --help` for current options. Common commands:

```bash
karakeep --json bookmarks search "rust is:fav" --limit 10
karakeep --json lists list
karakeep --json tags list
karakeep bookmarks add --link "https://example.com" --title "Example"
```

Search supports plain text and filters such as `is:fav`, `is:archived`, `#tag`, `list:"Reading"`, `url:github.com`, and `after:2026-01-01`.

Before saving, search for the URL. Reuse a matching bookmark's ID instead of creating a duplicate. Prefer a direct page for the specific product or place over a social post or profile, and retain the post as note context when useful. For a list, use the exact ID from `karakeep --json lists list`; ask if its name is ambiguous. Use `--tag-name` and `--list-id` for tags and list placement.

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
