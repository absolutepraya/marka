# Guided Docker Setup for This Fork

:::info Fork-specific setup
This page documents the guided setup shipped by Marka.
:::

The guided script creates a Docker Compose deployment without installing system packages, changing firewall rules, configuring DNS, or provisioning TLS. Docker Engine, Docker Compose v2, and OpenSSL must already be installed on a Linux `amd64` host.

## One-line start

Run the latest guided script from this fork:

```bash
curl -fsSLo /tmp/marka-setup.sh https://raw.githubusercontent.com/absolutepraya/marka/main/scripts/install.sh && bash /tmp/marka-setup.sh
```

The script is downloaded to a file before execution rather than piped directly into a shell. During setup it copies itself into the selected configuration directory, which defaults to `~/marka`.

For a reproducible setup, pin the download to an immutable release tag or commit SHA after reviewing that revision:

```bash
REF=<tag-or-commit-sha>; curl -fsSLo /tmp/marka-setup.sh "https://raw.githubusercontent.com/absolutepraya/marka/${REF}/scripts/install.sh" && bash /tmp/marka-setup.sh
```

## Preflight checks

Before asking configuration questions, the installer checks that the host can actually run the deployment. It verifies:

- Linux
- `amd64` / `x86_64` architecture
- the Docker CLI is available in `PATH`
- Docker Compose v2 is available through `docker compose`
- the current user can reach the Docker daemon
- OpenSSL is available for secret generation

If a required prerequisite is missing or unusable, setup stops immediately with an actionable error and does not write installation files. The installer deliberately does not install Docker or other host packages for you.

Node.js is **not** a host prerequisite. The Marka web application and workers run Node.js inside their Docker images.

`curl` is only needed to use the one-line download command. `tar` is checked later when the `backup` command is actually used.

## Recommended interactive setup

The interactive installer tells you that values shown in square brackets are defaults. Press **Enter** to accept a recommended value.

It then starts with:

```text
Use the recommended Marka setup? [Y/n]:
```

Pressing Enter selects the simple, dedicated deployment path. The installer asks only for the configuration directory, persistent data directory, and public application URL, while using these defaults:

- fresh data when the selected data directory is empty
- host port `3000`
- bind address `127.0.0.1`
- dedicated managed Meilisearch
- dedicated managed Chrome
- AI configuration deferred
- signups enabled for a fresh deployment so the first administrator can be created

If the chosen data directory is already non-empty, the installer does not silently treat it as fresh data. It asks whether it is an existing compatible Marka data directory.

Choose **No** at the recommended-setup prompt to enter advanced configuration. Advanced mode exposes the host port and bind address plus managed, external, or disabled search and browser-rendering choices, AI configuration, and the signup policy for an existing deployment.

Fresh deployments always start with signups enabled so the first administrator account can be created. After that account exists, set `DISABLE_SIGNUPS="true"` in `app.env` and run the generated helper with `start`.

## Generated deployment

The script uses the stable Compose project name `karakeep` for compatibility and the paired Marka images:

- `ghcr.io/absolutepraya/marka:web-stable`
- `ghcr.io/absolutepraya/marka:workers-stable`

`stable` is a mutable channel pointer for the current supported release. The
release workflow publishes immutable `web-v<version>` and `workers-v<version>`
tags, along with matching `web-sha-<sha>` and `workers-sha-<sha>` rollback tags.
The two application images are always treated as a pair.

A default fully featured installation runs four containers:

- `web` for the web application and API
- `workers` for crawling, screenshots, indexing, inference jobs, and other background work
- `meilisearch` for full-text search
- `chrome` for browser rendering and screenshots

SQLite is not a separate service. The database and local assets live in the persistent Marka data directory shared by `web` and `workers`.

The generated files are stored in the selected configuration directory:

- `docker-compose.yml`
- `app.env`
- `workers.env`
- `.data-dir`
- `install.sh`

`app.env`, `workers.env`, and `.data-dir` are written with restrictive permissions. Secrets are never printed and are not accepted as command-line arguments.

The default bind address is `127.0.0.1`. For an Internet-facing deployment, keep the application bound locally and place a reverse proxy with TLS in front of it. The script does not configure DNS, certificates, reverse proxies, or firewall rules.

## Search choices

`managed` is the recommended mode. It starts a dedicated Meilisearch container inside this Marka Compose deployment. The service is not published to the host network.

`external` is an advanced option for connecting to an externally managed Meilisearch service dedicated to this Karakeep deployment. In non-interactive mode, provide its key through `KARAKEEP_MEILI_MASTER_KEY`.

Do not point multiple independent Marka deployments at the same Meilisearch index. The application uses a fixed `bookmarks` index name, so the guided installer does not support a shared Meilisearch index between Marka instances.

`disabled` omits Meilisearch entirely. Full-text search will not be available.

## Browser-rendering choices

`managed` is the recommended mode. It starts the maintained Chrome image as a private container and connects the workers through the internal Compose network. The Chrome debugging port is not published to the host.

`external` is an advanced option that connects workers on demand to an existing Browserless endpoint. In non-interactive mode, provide the token through `KARAKEEP_BROWSERLESS_TOKEN`. Keep the endpoint private or protect it with TLS, authentication, and suitable capacity limits.

`disabled` turns off rendered screenshots and JavaScript browser crawling. Basic non-browser crawling can still work.

## AI choices

`openai` enables automatic tagging and summarization through OpenAI or an OpenAI-compatible API. In non-interactive mode, provide `KARAKEEP_OPENAI_API_KEY`. Optional overrides are available through `KARAKEEP_OPENAI_BASE_URL`, `KARAKEEP_INFERENCE_TEXT_MODEL`, and `KARAKEEP_INFERENCE_IMAGE_MODEL`.

`disabled` explicitly disables automatic tagging and summarization.

`deferred` is the recommended initial setting. It leaves AI disabled for now so the operator can configure a provider later in `workers.env`.

## Non-interactive example

Explicit deployment choices are required in non-interactive mode. Secrets are supplied through environment variables, not flags:

```bash
KARAKEEP_OPENAI_API_KEY='...' bash /tmp/marka-setup.sh \
  --non-interactive \
  --public-url https://keep.example.com \
  --data-mode fresh \
  --search managed \
  --renderer managed \
  --ai openai
```

The same prerequisite preflight runs in non-interactive and dry-run modes. Use `--dry-run` to validate the deployment plan without writing files or changing containers. Use `--no-start` to generate and validate the configuration without pulling or starting images.

## Reruns and reconfiguration

A normal rerun refuses to overwrite generated configuration. To deliberately reconfigure an existing guided deployment, use `--reconfigure`. The previous generated files are copied into a timestamped `config-backups/` directory before replacement.

The persistent data directory is never overwritten or deleted by the script. A non-empty directory cannot be used as `fresh` data.

## Operations

The script copy in the configuration directory also acts as the management helper:

```bash
~/marka/install.sh status
~/marka/install.sh backup
~/marka/install.sh update
~/marka/install.sh stop
~/marka/install.sh start
~/marka/install.sh uninstall
```

`backup` briefly stops the web and worker services, archives the authoritative SQLite/assets data directory, then restores them if they were running. Meilisearch is not included because it is a derived search index. The backup command checks for `tar` when it is invoked.

`update` pulls the current paired `web-stable` and `workers-stable` images and recreates changed services. For an exact rollback, edit both application image lines in the generated `docker-compose.yml` to matching immutable `web-v<version>` and `workers-v<version>` tags, or matching `web-sha-<sha>` and `workers-sha-<sha>` tags from one known-good source commit. Do not roll back only one service. After both services are healthy, restore the stable tags before the next normal update.

`uninstall` removes the Compose containers and network only. It intentionally keeps both the configuration directory and persistent data directory.

## Validation

The repository includes shell-level tests covering prerequisite preflight behavior, the recommended setup path, dry-run behavior, generated managed/external/disabled configurations, secret redaction, rerun protection, config backups, signup lockout prevention, backups, and non-destructive uninstall:

```bash
bash scripts/install.test.sh
```
