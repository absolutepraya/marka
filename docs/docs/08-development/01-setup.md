# Setup

This page explains how to run Marka locally from this repository.

It reflects the workflow used in this fork:
- Node 24.18.1 (temporary pin; see `.nvmrc`)
- `pnpm` via corepack
- Docker-compatible local runtime, such as OrbStack on macOS
- [`wt`](https://github.com/absolutepraya/wt) for isolated worktrees
- a root `.env` file symlinked into the apps that read it
- `web` + `workers` running locally
- Meilisearch + headless Chrome typically provided by Docker in development

## Recommended quick start

For most contributors to this fork, the fastest path is:

```bash
nvm install
nvm use
corepack enable
pnpm install

ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/workers/.env
ln -sf ../../.env packages/db/.env

pnpm db:migrate
pnpm dev:start
```

This starts:
- the web app on the current worktree's web port, `http://localhost:3000` in the main workspace
- the workers
- the shared Meilisearch service on `http://127.0.0.1:7700`
- the shared headless Chrome/CDP service on `http://127.0.0.1:9250`

Useful variants:
- `pnpm dev:start` - foreground mode
- `pnpm dev:start -d` - detached mode
- `pnpm dev:stop` - stop detached services for this worktree
- `pnpm dev:infra:status` - inspect shared Chrome and Meilisearch
- `pnpm dev:infra:down` - explicitly remove shared containers while preserving Meilisearch data

If you want the full operator-oriented notes for this fork’s local dev and deploy flow, see the repository guide at:
- `docs/operator-setup.md`

## Runtime requirements

### Node and pnpm

This repo currently pins Node 24.18.1 in `.nvmrc` and uses `pnpm@11.25.0` via corepack. The exact Node patch is temporary: Node 24.19.0 has a native-addon cleanup regression tracked in [nodejs/node#65042](https://github.com/nodejs/node/pull/65042).

```bash
nvm install
nvm use
corepack enable
pnpm install
```

If you use another Node version manager, have it honor the exact version in `.nvmrc` instead of selecting a floating Node 24 release.

## Environment setup

Create a root `.env` file first:

```bash
cp .env.sample .env
```

Then symlink it into the apps/packages that load environment variables from their own working directory:

```bash
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/workers/.env
ln -sf ../../.env packages/db/.env
```

### Important variables

At minimum, configure:

- `DATA_DIR` — where SQLite data and stored assets live
- `NEXTAUTH_SECRET` — required for auth/session signing

Commonly useful in local development:

- `MEILI_ADDR=http://127.0.0.1:7700`
- `BROWSER_WEB_URL=http://127.0.0.1:9250`
- `MARKA_DEV_CHROME_PORT=9250`
- `OPENAI_API_KEY=...` if you want AI tagging/summarization enabled

After the env file is ready, initialize the database:

```bash
pnpm db:migrate
```

## Running the app manually

If you do not want to use `./start-dev.sh`, run the services directly.

### Web app

```bash
pnpm web
```

Open:
- `http://localhost:3000`

### Workers

```bash
pnpm workers
```

### Notes about dependencies

- The web app can boot without every dependency running.
- Search requires Meilisearch.
- Crawling and background processing require workers.
- The easiest way to get Chrome + Meilisearch right in this fork is `pnpm dev:start`.

## Meilisearch

Marka uses Meilisearch for search.

A quick local container:

```bash
pnpm dev:infra:up
```

Then point `MEILI_ADDR` at `http://127.0.0.1:7700`.

When bypassing `pnpm dev:start`, set an explicit Meilisearch namespace before starting `web` or `workers`. Use `main_` only in the main workspace; parallel worktrees need distinct prefixes. The `wt` setup flow generates a unique prefix for each worktree.

```bash
export MEILI_INDEX_PREFIX=main_
pnpm dev:infra:up
pnpm web
pnpm workers
```

See the [operator guide](../../operator-setup.md#directmanual-start) for the parallel-worktree details.

## Headless Chrome

Marka uses headless Chrome for crawling and page capture workflows.

In this fork, the preferred dev path is to let `pnpm dev:start` bring Chrome up for you. If you are troubleshooting crawling, make sure the workers can reach `BROWSER_WEB_URL`, which defaults to IPv4 loopback at `127.0.0.1:9250`.

## Browser extension

```bash
cd apps/browser-extension
pnpm dev
```

Then:
- open your browser’s extension settings
- enable developer mode
- load the generated `dist` directory as an unpacked extension

## Mobile app

The mobile app lives under `apps/mobile` and uses Expo.

### Quick start

```bash
pnpm ios
pnpm android
```

### Prerequisites

For iOS:
- macOS
- Xcode
- iOS Simulator

For Android:
- Android Studio
- Android SDK
- emulator or physical device

If you are returning after a large Expo/dependency update, a clean reset is often helpful:

```bash
pnpm run clean:workspaces
pnpm install
pnpm --filter @karakeep/mobile clean:prebuild
```

## Docker development stack

If you prefer to run the stack under Docker Compose, use:

```bash
docker compose -f docker/docker-compose.dev.yml up
```

This is useful when you want:
- the full dependency stack under Docker
- a more isolated environment
- reproducible service bootstrapping across machines

## Troubleshooting notes

A few issues come up often in this repo:

- If auth looks broken, check that the root `.env` was symlinked into `apps/web`, `apps/workers`, and `packages/db`.
- If SQLite tables are missing, re-run `pnpm db:migrate` and confirm `DATA_DIR` points where you think it does.
- If `next dev` crashes with a stale Turbopack / `instrumentation.ts` parse issue, clear `apps/web/.next`.
- If search is missing, confirm Meilisearch is running and `MEILI_ADDR` is set.
- If crawling is missing, confirm the workers are running and Chrome is reachable.
