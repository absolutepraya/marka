# Operator setup and deploy notes

This is the canonical operator and developer guide for Marka.

Use it for:
- local development in this repository
- CI and image-build behavior
- production deployment notes specific to this repository

## Repo identity

- **Origin:** `git@github.com:absolutepraya/marka.git`
- **Branch model:** `main` is the active integration/deploy branch for this repository

## Local development

### Runtime
- Node 24.18.1 (`.nvmrc`; temporarily pinned to avoid the Node 24.19 native-addon cleanup regression)
- `pnpm@11.2.1` via corepack
- Docker-compatible local runtime, such as OrbStack on macOS
- [`wt`](https://github.com/absolutepraya/wt) for isolated worktrees

### First-time setup

```bash
nvm install
nvm use
corepack enable
pnpm install

cp .env.sample .env

ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/workers/.env
ln -sf ../../.env packages/db/.env

mkdir -p "$(grep '^DATA_DIR=' .env | cut -d= -f2)"
pnpm db:migrate
```

The exact Node patch is temporary. Node 24.19.0 has a native-addon cleanup regression tracked in [nodejs/node#65042](https://github.com/nodejs/node/pull/65042); use the version in `.nvmrc` until a fixed Node 24 release is available.

### Preferred start flow

```bash
pnpm dev:start
```

Variants:
- `pnpm dev:start` — foreground
- `pnpm dev:start -d` — detached (`.dev/` logs, shell returns immediately)
- `pnpm dev:stop` — stop only this workspace's detached web/workers processes
- `pnpm dev:infra:status` — show the shared Chrome/Meilisearch container status
- `pnpm dev:infra:up` — explicitly start/reuse shared Chrome + Meilisearch
- `pnpm dev:infra:down` — explicitly remove the shared containers while preserving the Meilisearch data volume

`pnpm dev:start` automatically ensures the machine-level dev infrastructure is running, then starts only this workspace's native processes:

- `web`
- `workers`

The machine-level infrastructure is shared across all local worktrees:

- `marka-dev-meilisearch` on `127.0.0.1:7700`
- `marka-dev-chrome` on `127.0.0.1:9250` by default, or the port configured by `MARKA_DEV_CHROME_PORT`

The Chrome helper uses `ghcr.io/karakeep-app/karakeep-chrome:release`, which is published for both `linux/amd64` and `linux/arm64`. The Meilisearch container uses the named volume `marka-dev-meilisearch-data`, which survives `pnpm dev:infra:down`.

`pnpm dev:stop` never stops the shared containers. This is intentional: another worktree may still be using them.

There is no local SMTP or mail container in this workflow. Email behavior uses the external SMTP settings configured in `.env`, when present.

### Parallel worktrees

Worktrees share the physical Chrome and Meilisearch containers, but application state stays isolated.

`scripts/setup-worktree.sh` keeps these values per worktree:

- unique `KARAKEEP_PORT`
- unique `DATA_DIR` (`<worktree>/.data/local`)
- unique `API_URL` / `NEXTAUTH_URL`
- unique `MEILI_INDEX_PREFIX`

Every generated worktree points at the same local infrastructure endpoints:

```text
MEILI_ADDR=http://127.0.0.1:7700
BROWSER_WEB_URL=http://127.0.0.1:9250 # default; follows MARKA_DEV_CHROME_PORT when overridden
```

The `wt` slot controls only worktree-owned state. `WT_PORT_BASE` is added to the base web port `3000`, so slot 1 uses `3100`; shared Chrome and Meilisearch keep their stable machine-level ports.

The Meilisearch plugins prepend `MEILI_INDEX_PREFIX` to both index UIDs. For example, a worktree prefix `issue-123-7_` produces:

```text
issue-123-7_bookmarks
issue-123-7_bookmarks_vectors
```

The generated prefix is based on the normalized worktree name plus `WT_PORT_BASE`, so two configured worktrees do not share search/vector state even though they use the same Meilisearch server.

The main workspace uses `main_` when `pnpm dev:start` does not find an explicit `MEILI_INDEX_PREFIX`. When `MEILI_INDEX_PREFIX` is entirely unset outside this fork's dev launcher, the plugins retain the original production-compatible index names `bookmarks` and `bookmarks_vectors`.

Do not share a worktree's `.data/local` directory with another worktree. SQLite rows and stored assets are authoritative per workspace; Meilisearch remains derived state and can be rebuilt into that workspace's namespace.

### T3 Code worktrees

Import the project actions from the root [`t3.json`](../t3.json) in T3 Project
settings. The `Setup worktree` action runs automatically for new T3 worktrees
after import. Its adapter reserves a T3-specific port, then calls
[`scripts/dev-worktree.sh`](../scripts/dev-worktree.sh), which is also used by WT.
The shared script installs dependencies, creates the package `.env` links, pulls
the full production state into the worktree, runs migrations, and starts
`pnpm dev:start -d`.

The T3 setup assigns web ports in the `4000` to `4999` range, keeping them
separate from the main workspace and WT slots. Assignments are kept in the
ignored `.dev/t3-ports.tsv` registry and reserved under a filesystem lock, so
concurrent worktree creation cannot choose the same port. Set
`T3_PORT_REGISTRY_FILE` only when a different local registry location is needed.
Existing T3 worktrees need the setup action run once manually because the
automatic hook only runs during creation. The T3 `Start dev` and `Stop dev`
actions call the same script; T3 currently exposes Stop as a manual action, while
WT invokes it during `wt rm`.

### Direct/manual start

If you intentionally bypass `pnpm dev:start`, manual starts **must** set an explicit unique `MEILI_INDEX_PREFIX` for that workspace. Use `main_` only for the main workspace; parallel worktrees need distinct prefixes.

```bash
export MEILI_INDEX_PREFIX=main_
pnpm dev:infra:up
pnpm web
pnpm workers
```

Direct commands do not synthesize a namespace for you. Leaving the prefix unset selects the backward-compatible unprefixed indexes and can mix search/vector state when multiple manual worktrees share the same Meilisearch server.

Notes:
- Meilisearch and headless Chrome are optional for booting the app, but required for full search/crawling behavior.
- If `next dev` crashes with a stale Turbopack / `instrumentation.ts` parse issue, clear `apps/web/.next` and restart.
- If port `7700` is occupied by something other than `marka-dev-meilisearch`, or the configured Chrome port by something other than `marka-dev-chrome`, `pnpm dev:infra:up` fails instead of silently reusing an unknown service.

### Verify the offline iPhone PWA

1. Open Marka in Safari on an iPhone and use **Add to Home Screen**.
2. Open the installed app, sign in, and wait until the library activity indicator shows **Online** with a successful sync time.
3. Keep the installed app open, turn off Wi-Fi and cellular data, and confirm the bookmark grid, local-only search, and available thumbnails render without a network request. A cold launch after force-closing remains unsupported: reconnect and open the app once before attempting that launch.
4. While offline, verify each supported write reports a pending item in the library activity indicator: edit an existing bookmark's title, favorite state, tags, or membership in an existing list; create a tag inline while editing an existing bookmark; save a text-only note; and delete one owned bookmark after its five-second undo window.
5. Restore connectivity. Confirm each pending write disappears after one successful sync and the server state matches the local intent. For a locally created text note, also confirm its client-generated ID does not produce a duplicate after replay.
6. Create a same-field edit from another signed-in device before reconnecting the offline phone. Confirm Marka presents a field-conflict choice instead of overwriting either value silently. For a rejected list or delete mutation, confirm the explicit discard-and-refresh flow restores the authoritative state.
7. Log out on the phone, reopen the installed app offline, and confirm that no bookmarks, thumbnails, search results, pending writes, or conflict records remain.

Link bookmark creation, uploads, PDFs and archived reader pages, crawler/AI jobs, sharing and collaborator changes, standalone tag or list management, list creation, and bulk destructive actions require a connection.

## Environment notes

The root `.env` is the source of truth, but several processes load `.env` from their own working directory. That is why the symlinks above are required.

The most important variables for local development are:
- `DATA_DIR`
- `NEXTAUTH_SECRET`
- `MEILI_ADDR` (shared dev default: `http://127.0.0.1:7700`)
- `MEILI_INDEX_PREFIX` (per-worktree search/vector namespace; empty remains backward-compatible outside the dev launcher)
- `BROWSER_WEB_URL` (shared dev default: `http://127.0.0.1:9250`)
- `MARKA_DEV_CHROME_PORT` (shared dev Chrome host port, default: `9250`)
- `OPENAI_API_KEY` (if AI tagging/summarization should work)

### Pull production state into local development

Use this helper when local development should mirror the persisted production state from the VPS:

```bash
pnpm prod:pull-state
pnpm prod:pull-state --dry-run
```

The command replaces local development state by default, first backing up the current `DATA_DIR`. It always pulls the full `/data` volume, including SQLite files and stored assets. Use `--dry-run` to inspect the plan without replacing local state.

Required root `.env` keys:
- `DATA_DIR`
- `KARAKEEP_PROD_SSH_HOST`
- `KARAKEEP_PROD_COMPOSE_DIR`

Optional root `.env` keys:
- `KARAKEEP_PROD_SSH_USER`
- `KARAKEEP_PROD_COMPOSE_PROJECT` (defaults to `karakeep`)
- `KARAKEEP_PROD_COMPOSE_SERVICE`
- `KARAKEEP_PROD_EXPORT_IMAGE`

For the personal VPS, set `KARAKEEP_PROD_COMPOSE_DIR=/home/praya/marka`. The root `/marka` path and the retired `/home/praya/karakeep` path are not the production compose directory.

Set `KARAKEEP_PROD_COMPOSE_PROJECT` to the Compose project name used by the production stack. The personal VPS keeps the compatibility project name `karakeep`; the helper does not infer this value from the compose directory name.

A production-state pull still populates only that workspace's SQLite/assets state. Its local search/vector data belongs to the workspace's own `MEILI_INDEX_PREFIX` namespace in the shared local Meilisearch container.

## CI

Primary workflow:
- `.github/workflows/ci.yml`

It runs:
- lint
- format
- typecheck
- tests
- open-api-spec

Repository-specific notes:
- this repository does **not** use Turbo remote cache
- some CI jobs reclaim disk space before heavy steps because typecheck/tests can otherwise exhaust hosted-runner storage
- local development and production use Node 24.18.1 from `.nvmrc`; the combined CI `tests` job temporarily overrides setup to Node 22.21.1 because Vitest + `better-sqlite3` can abort during Node 24 worker teardown; remove that override once the Node fix tracked in [nodejs/node#65042](https://github.com/nodejs/node/pull/65042) ships in a usable Node 24 release
- `knip` and `react-doctor` run as **non-blocking** report jobs
- `.github/workflows/dev-workflow-tests.yml` validates the shared local-dev Bash lifecycle and Meilisearch namespace behavior when relevant files change

## Extra quality tooling

- `pnpm knip` — unused files / deps / exports (`knip.json`)
- `pnpm doctor` / `pnpm doctor:staged` — React health scan via react.doctor
- `react-grab` — dev-only component/source capture helper in the web app
- **Biome is intentionally not used** in this repo

## Build and deploy model

This repository deploys with a **pull-based split Docker flow**.

### Release and build path
- an annotated `vMAJOR.MINOR.PATCH` Git tag is the shared web and workers release identity
- after successful CI on `main`, `automatic-release.yml` classifies merged Conventional Commit messages and creates the next tag only when a release is warranted
- `feat` produces a minor bump, breaking-change markers produce a major bump, release-worthy fixes and runtime changes produce a patch bump, and documentation-only changes produce no release
- agents and contributors can use a `Release: major|minor|patch|none` commit footer when the default classification needs an explicit override
- the tag must point to a commit reachable from `main` with successful exact-commit blocking CI: lint, format, typecheck, tests, and open-api-spec
- `.github/workflows/release.yml` builds paired immutable `:web-v<version>` and `:workers-v<version>` images, plus matching `:web-sha-<sha>` and `:workers-sha-<sha>` rollback tags
- the workflow validates source metadata and promotes the mutable `:web-stable` and `:workers-stable` channel only after both immutable images are verified
- GitHub Releases are generated from the same tag after image promotion; the Git tag and source commit remain authoritative
- `v*` tags are protected from updates and deletion, and the release workflow accepts direct or recovery triggers only from the repository owner or the automatic GitHub Actions release workflow
- `.github/workflows/docker.yml` keeps commit-addressed SHA images available for successful `main` builds, but does not move the stable channel
- package manifest versions remain independent of the shared product release
- `web` runs Next.js and owns database migrations
- `workers` runs background work with `WORKER_PROFILE=screenshot-first`

### Deploy path
- the VPS runs a Watchtower container
- production Compose defaults to the paired `ghcr.io/<owner>/marka:web-stable` and `ghcr.io/<owner>/marka:workers-stable` channel
- Watchtower polls the paired stable tags and rolls `web` and `workers` forward independently after their immutable release images have both been published
- this is a bounded rolling overlap, not an atomic multi-container switch: every release must keep `web` and `workers` compatible with the immediately preceding release, including database migrations
- Compose starts workers only after web is healthy and Meilisearch has started
- Browserless is a token-protected private service attached through the external `karakeep-renderer` network
- only workers join `karakeep-renderer`; no Browserless port is public

Important characteristics:
- no SSH deploy from CI
- GHCR package is public, so the VPS pulls anonymously
- the canonical production compose is `deploy/docker-compose.prod.yml`

For an exact rollback, set both `KARAKEEP_WEB_IMAGE` and
`KARAKEEP_WORKERS_IMAGE` to matching immutable version tags, or matching SHA
tags from one known-good source commit. Restore the stable channel only after
both services have been verified healthy. A stable-channel promotion can
temporarily expose the adjacent web and workers builds because Watchtower is
not an atomic multi-container switch.

## Production compose

Canonical compose file:
- `deploy/docker-compose.prod.yml`

Expected service shape:
- `web`
- `workers`
- `meilisearch`
- `watchtower`

### Worker-only secrets and Browserless

Create `.workers.env` beside the production compose file. It is mounted only into `workers`, never `web`, and must contain `BROWSERLESS_TOKEN`, proxy credentials, and `OPENAI_API_KEY`. For the full enrichment rollout, configure the same worker-only file with `OPENAI_BASE_URL`, `INFERENCE_TEXT_MODEL`, `INFERENCE_IMAGE_MODEL`, `INFERENCE_ENABLE_AUTO_TAGGING`, `INFERENCE_ENABLE_AUTO_SUMMARIZATION`, `OCR_USE_LLM`, `TRANSCRIPTION_ENABLED`, `TRANSCRIPTION_MODEL`, `AZURE_SPEECH_ENDPOINT`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_MODEL`, `AZURE_SPEECH_API_VERSION`, `EMBEDDING_ENABLE_AUTO_INDEXING`, `EMBEDDING_TEXT_MODEL`, and `EMBEDDING_DIMENSIONS` as applicable. When the Azure Speech pair is configured, Marka uses MAI-Transcribe-2 for media transcription. For YouTube links, `yt-dlp` captions remain preferred and Azure Speech is used only when no usable captions are available. Keep the token and all credential values out of source control. `BROWSERLESS_URL` targets the Browserless service through `karakeep-renderer`.

Configure Browserless on its private host with:

```text
CONCURRENT=2
QUEUED=4
TIMEOUT=45000
```

Do not publish a Browserless port. The external `karakeep-renderer` Docker network is the only path from workers to Browserless.

### Controlled embedding-cleanup rollout

The stale-embedding migration is safe only as a controlled rollout. An empty-queue preflight by itself is not sufficient: pause automatic updates, capture a fresh successful read-only check immediately before the controlled `web` start that applies the migration, then resume automatic updates.

From the repository root, where the canonical production Compose file is `deploy/docker-compose.prod.yml`:

1. Pause Watchtower so it cannot recreate `web` during the gate:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml stop watchtower
   ```

2. Immediately before the controlled application start, run this read-only check and record the command's `Embedding queue is empty` output with the deployment timestamp. A non-empty result blocks the cleanup. Do not reuse an earlier successful check or start `web` if this command fails:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml exec -T web node <<'NODE'
   const Database = require("better-sqlite3");
   const db = new Database("/data/queue.db", { readonly: true });
   const rows = db.prepare(
     "SELECT queue, status, COUNT(*) AS count FROM tasks WHERE queue = 'embeddings_queue' GROUP BY queue, status",
   ).all();
   if (rows.length !== 0) {
     console.error(JSON.stringify(rows));
     process.exit(1);
   }
   console.log("Embedding queue is empty");
   NODE
   ```

3. Without any intervening application start, run the controlled `web` start and wait for its health check:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml up -d --no-deps --force-recreate --wait --wait-timeout 120 web
   ```
   `--wait` completes only when `web` is healthy; the image starts its health endpoint only after its internal `init-db-migration` service completes. A timeout or health failure blocks the rollout, so do not start Watchtower.

4. Resume automatic updates only after the controlled startup reports healthy:

   ```bash
   docker compose -f deploy/docker-compose.prod.yml start watchtower
   ```

Key parameters:
- `KARAKEEP_PORT`
- `KARAKEEP_WEB_IMAGE`
- `KARAKEEP_WORKERS_IMAGE`
- `KARAKEEP_ENV_FILE`
- `KARAKEEP_WORKERS_ENV_FILE`

Each service sets a `mem_limit` (web `512m`, workers `512m`, meilisearch `512m`, watchtower `128m`) as a ceiling to keep the stack from ballooning and thrashing swap on the shared 8GB VPS. These are caps, not reservations; raise a value if a service is legitimately OOM-killed.

The web container binds to localhost and is expected to sit behind nginx.

## VPS provisioning notes

Before first startup, create and verify the private external renderer network. Compose does not create an `external: true` network:

```bash
if ! docker network inspect karakeep-renderer >/dev/null 2>&1; then
  docker network create --internal karakeep-renderer
fi
test "$(docker network inspect --format '{{.Internal}}' karakeep-renderer)" = true
```

Typical high-level flow:

```bash
~/setup-subdomain.sh <sub> <port>
mkdir ~/<dir> && cd ~/<dir>
# copy deploy/docker-compose.prod.yml here as docker-compose.yml
cat > .env <<'ENV'
NEXTAUTH_SECRET=...
MEILI_MASTER_KEY=...
NEXTAUTH_URL=https://<sub>.<your-domain>
KARAKEEP_PORT=<port>
DISABLE_SIGNUPS=false
ENV
docker compose up -d
```

Notes:
- create the relevant DNS record before expecting nginx/HTTPS to work
- current operator notes assume the service is fronted by nginx
- depending on SSL/proxy mode, a Cloudflare orange-cloud proxy can cause redirect loops; DNS-only/grey-cloud has been the safer path for this setup

## Related docs

- Public product framing: `README.md`
- Contribution rules: `CONTRIBUTING.md`
- Operator operation: `docs/operator-setup.md`
- Docs-site development: `docs/README.md`
- Assistant operations context: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`
