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
- GNU coreutils (`timeout`, `realpath`, `df`, and the usual file utilities) are available
- Compose supports `up --wait --wait-timeout`

After configuration, setup checks data-mode constraints, writable directories, port conflicts, and whether another installation owns the `karakeep` Compose project. Low free disk space or RAM produces a warning. Dry runs perform the same checks.

If a required prerequisite is missing or unusable, setup stops immediately with an actionable error and does not write installation files. The installer deliberately does not install Docker or other host packages for you.

Node.js is **not** a host prerequisite. The Marka web application and workers run Node.js inside their Docker images.

`curl` is only needed to use the one-line download command. `tar` is checked later when the `backup` command is actually used.

## Recommended interactive setup

The interactive installer tells you that values shown in square brackets are defaults. Press **Enter** to accept a recommended value.

Setup asks for an installation directory and offers a recommended configuration. If that directory already contains a guided installation, it asks before reconfiguring and loads the installed values as defaults.

The recommended configuration uses dedicated managed Meilisearch and Chrome, with AI deferred. Setup asks how you will access Marka:

- `local`: a browser on this server, or an SSH tunnel from your laptop. The listener stays on `127.0.0.1`.
- `lan`: devices on a trusted network. Enter the server's LAN URL; the listener binds to `0.0.0.0`. This mode serves HTTP and should remain off the public Internet.
- `domain`: an HTTPS domain with an operator-managed reverse proxy. The listener stays on `127.0.0.1`; setup explains the proxy destination.

The host port is configurable in the recommended flow. For a remote VPS, `localhost` in your laptop's browser refers to your laptop, not the VPS. Local mode prints an SSH tunnel command you can run from your laptop before opening Marka.

If the chosen data directory is already non-empty, the installer asks whether it is compatible existing Marka data. A fresh installation cannot reuse a non-empty directory. An existing-data installation requires a directory that already exists.

Choose advanced setup to configure external or disabled search/rendering services, AI, and a custom bind address. `--access local|lan|domain` is also available for non-interactive setup. Domain mode requires HTTPS; LAN mode requires a URL other devices can reach.

Fresh deployments always start with signups enabled so the first administrator account can be created. After that account exists, close registration while keeping the installed settings:

```bash
~/marka/install.sh --non-interactive --reconfigure --disable-signups
```

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
- `meilisearch.env` (managed search only, containing its master key)
- `.installer-state` (non-secret installer choices)
- `.installed-images` (written after startup, recording image IDs)
- `.data-dir`
- `install.sh`

Generated env files and installer metadata are written with restrictive permissions. The managed Meilisearch container receives only its own master key; provider and session credentials stay with the application services. Secrets are never printed and are not accepted as command-line arguments.

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

`deferred` is the recommended initial setting. Enable AI later by running the installed helper with `--reconfigure`, choosing advanced setup, and selecting `openai`. The prompt hides the API key as you type. In non-interactive mode:

```bash
# Supply KARAKEEP_OPENAI_API_KEY privately in the process environment first.
~/marka/install.sh --non-interactive --reconfigure --ai openai
```

AI credentials and model settings live in `app.env`, shared by web and workers, so the web UI can recognize the provider. Enabling AI from a deferred setup also enables automatic tagging and summarization. To configure manually, put the provider key/model settings in `app.env`, set `INFERENCE_ENABLE_AUTO_TAGGING="true"` and `INFERENCE_ENABLE_AUTO_SUMMARIZATION="true"` there, and run `install.sh start`. Adding only a key to `workers.env` is insufficient.

## Non-interactive example

Fresh non-interactive installations require explicit deployment choices. Reconfiguration can reuse installed choices. Secrets are supplied through environment variables, not flags:

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

A normal rerun refuses to overwrite generated configuration. To deliberately reconfigure an existing guided deployment, use `--reconfigure`. The previous generated files and Compose override file are copied into a unique timestamped `config-backups/` directory before replacement. The installer keeps the session secret, managed search key, installed image pins, service choices, port, URL, and custom env entries unless you explicitly change them. Existing v2 guided installations are recognized without needing new metadata.

Reconfiguration applies settings using locally available images without refreshing the image tags. Use the separate `update` command when you want to fetch newer images. Initial installation and updates retry failed image downloads up to three times.

The generated `docker-compose.yml` remains installer-owned. Keep custom Compose additions in `docker-compose.override.yml`, which reconfiguration preserves. Env files are read as data, never sourced as shell scripts. Explicit `KARAKEEP_*` environment values can replace the corresponding installed secrets or provider settings. Change a managed search key through reconfiguration so `app.env` and `meilisearch.env` stay aligned.

The persistent data directory is never overwritten or deleted by the script. A non-empty directory cannot be used as `fresh` data.

## Operations

The script copy in the configuration directory also acts as the management helper:

```bash
~/marka/install.sh status
~/marka/install.sh doctor
~/marka/install.sh backup
~/marka/install.sh update
~/marka/install.sh stop
~/marka/install.sh start
~/marka/install.sh uninstall
```

The installed helper discovers the configuration beside itself, including installations outside `~/marka`. `--install-dir` remains available when using a separately downloaded helper.

Install, `start`, and `update` wait for web health and worker `/ready` before reporting success. The default readiness timeout is 180 seconds; use `--wait-timeout 300` on a slower host. This checks container readiness, not public DNS/TLS reachability or every external provider. Failures show container status and the commands for diagnostics. `doctor` validates Compose and checks both application health endpoints without printing env files.

`backup` briefly stops web and workers, archives the authoritative SQLite/assets directory, and restarts exactly the services that were running, waiting for their health checks. It attempts to restart those services even when archiving fails. Failed archives are removed. The destination must be outside the data directory. Meilisearch is omitted because it is a derived search index. Configuration backups are separate and contain secrets, so protect both backup locations.

`update` pulls the configured images, records the current image IDs, backs up configuration and data, then recreates changed services and waits for readiness. If a backup fails, it does not apply the update. Image pins remain pins; the helper does not silently reset them to stable. Keep the backup from before the update until the new version is verified.

For an exact rollback, set both application image lines to matching immutable `web-v<version>` / `workers-v<version>` or `web-sha-<sha>` / `workers-sha-<sha>` tags from one known-good commit. A database migration may require restoring the corresponding pre-update data as well. Never assume that older images can safely read a newer database. After recovery is verified, restore the stable tags before the next normal update if you want to follow that channel.

### Restore a data backup

Stop the deployment first. Keep the current data directory separately, then extract your trusted installer-created archive into the **parent** of the original data directory. For the default layout:

```bash
~/marka/install.sh stop
# Choose an unused destination and keep it until recovery is verified.
mv ~/marka/data ~/marka/data-before-restore
tar --no-same-owner -xzf /path/to/marka-data-backup.tar.gz -C ~/marka
~/marka/install.sh start
~/marka/install.sh doctor
```

Use a backup from this installation with its matching config, secrets, and compatible image pair. For a custom data directory, adjust both paths and extract into its parent. Verify account access, bookmarks, and stored screenshots after recovery. The search index is derived; use the admin search reindex operation after restoring older application data.

`uninstall` removes the Compose containers and network only. It intentionally keeps both the configuration directory and persistent data directory.

## Validation

The fast regression suite uses mocked Docker commands and covers configuration, secret preservation, failure recovery, dry-run constraints, helper discovery, and readiness errors:

```bash
bash scripts/install.test.sh
```

The real-Docker suite runs only on a disposable Linux `amd64` host with Node available for its test client. It refuses an existing `karakeep` Compose deployment. It downloads the public stable image pair, creates a disposable administrator, saves a JavaScript-rendered page, verifies screenshot bytes and search, closes signups, restarts, backs up/restores data, exercises update, and verifies non-destructive uninstall. It also checks literal credential encoding inside real web and worker containers. It removes only its own test containers, volumes, and temporary files. No paid AI request is made.

```bash
bash scripts/install.integration.test.sh
```

The Installer Tests workflow runs both suites for installer changes and supports manual dispatch. Passing shell tests alone is not evidence that published images boot successfully.
