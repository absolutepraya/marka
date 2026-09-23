<div align="center">
  <img width="279" src="./screenshots/marka-logo-readme.png" alt="Marka" />
</div>

<p align="center">
  <strong>Everything you want to come back to.</strong><br />
  Your self-hosted personal library for the links, watchlists, wishlists, notes, and files worth remembering.
</p>

<p align="center">
  <a href="https://github.com/absolutepraya/marka/actions/workflows/ci.yml"><img src="https://github.com/absolutepraya/marka/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://coderabbit.ai"><img src="https://img.shields.io/coderabbit/prs/github/absolutepraya/marka?label=CodeRabbit%20Reviews&labelColor=171717&color=FF570A" alt="CodeRabbit Reviews" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/absolutepraya/marka" alt="License" /></a>
  <a href="./.nvmrc"><img src="https://img.shields.io/badge/Node.js-24.18.1-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24.18.1" /></a>
  <a href="./package.json"><img src="https://img.shields.io/badge/pnpm-11.2.1-F69220?logo=pnpm&logoColor=white" alt="pnpm 11.2.1" /></a>
</p>

Marka is a self-hosted personal library for everything you want to remember or revisit, not just browser bookmarks. Keep the things that would otherwise be scattered across apps, tabs, and devices in one visual library you control.

<p align="center">
  <img src="./screenshots/marka-library-overview.png" alt="Marka library showing visual cards for saved social posts, data visualizations, articles, products, movies, and UI references." />
</p>

## One place for the things you save everywhere

Maybe it is a movie you want to watch, a product you might buy, a TikTok place or hotel, an Instagram career tip, an engineering article, a UI reference, or course material you will need again. Marka brings those saved things together so they do not become a pile of forgotten links.

### Save it

Save links, notes, images, PDFs, and web pages in one library. Bring material in through the browser extension, RSS, CLI, API, and MCP tooling.

### Keep the context

Marka can retain titles, descriptions, previews, screenshots, archived content, tags, highlights, and readable page content. Later, you can recognize why something mattered without reopening every source.

### Rediscover it

Browse visual cards, organize with lists, tags, rules, and sharing, then search across your saved material when you need it. Optional AI tagging and summaries can help you get the point before reading the whole thing again.

### Keep it yours

Run Marka on your own infrastructure and use the library through the web app and PWA. Your saved material stays in the setup you control.

## Start here

- [Open Marka](https://marka.abhipraya.dev/)
- [Self-host Marka](#self-host-marka)
- [Read the documentation](docs/README.md)
- [Contribute to Marka](CONTRIBUTING.md)

## Self-host Marka

For a Linux `amd64` host with Docker Engine, Docker Compose v2, and OpenSSL already installed:

```bash
curl -fsSLo /tmp/marka-setup.sh https://raw.githubusercontent.com/absolutepraya/marka/main/scripts/install.sh && bash /tmp/marka-setup.sh
```

The guided installer configures the application, search, browser rendering, and optional AI. It writes secrets to restricted env files, validates the generated Compose stack, and starts the deployment.

The default listener is `127.0.0.1:3000`. For an Internet-facing deployment, put a reverse proxy with TLS in front of it. The installer does not install Docker, configure DNS, change firewall rules, or provision certificates.

For reproducible setup, replace `main` with a reviewed release tag or commit SHA:

```bash
REF=<tag-or-commit-sha>; curl -fsSLo /tmp/marka-setup.sh "https://raw.githubusercontent.com/absolutepraya/marka/${REF}/scripts/install.sh" && bash /tmp/marka-setup.sh
```

Read the [guided installation guide](docs/docs/02-installation/11-guided-docker-setup.md) for all configuration modes and rollback details.

Marka web and workers releases share an annotated `vMAJOR.MINOR.PATCH` Git tag.
The production Compose file and guided installer follow the paired `stable`
channel. Each release also keeps immutable version and source-commit image tags
so operators can roll back web and workers together.

After a successful CI run on `main`, the automatic release workflow classifies
the merged Conventional Commit messages. It creates the next annotated release
tag only for release-worthy changes, then the tag workflow publishes the paired
images and GitHub Release. Documentation-only and other explicitly non-release
changes do not create a version. Package manifest versions remain independent.

## Develop Marka

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for contribution rules and [`docs/operator-setup.md`](docs/operator-setup.md) for local development and deployment workflows.

### Runtime prerequisites

The supported local development runtime is:

- Node.js 24.18.1 from [`.nvmrc`](.nvmrc)
- pnpm 11.2.1 through Corepack, as pinned in [`package.json`](package.json)
- Git and a Docker-compatible runtime, such as OrbStack on macOS
- [`wt`](https://github.com/absolutepraya/wt) for isolated worktrees

After the repository is configured, the normal development command is:

```bash
pnpm dev:start
```

`pnpm dev:start` runs the current worktree's web and workers processes. It reuses one machine-level Chrome/CDP service at `127.0.0.1:9250` and one Meilisearch service at `127.0.0.1:7700`. Each worktree keeps its own SQLite/assets directory, web port, and Meilisearch index namespace. Worktree slot 1 uses web port `3100`, slot 2 uses `3200`, and so on. Shared Chrome can be moved with `MARKA_DEV_CHROME_PORT` when the default port is occupied.

The repository is supported by [`wt`](https://github.com/absolutepraya/wt):

```bash
wt new ui-polish
wt ls
```

The project configuration in [`.wt/config.toml`](.wt/config.toml) prepares isolated
dependencies, data, ports, and Meilisearch namespaces for each worktree. WT and T3
delegate their shared setup and dev-server commands to
[`scripts/dev-worktree.sh`](scripts/dev-worktree.sh), while each tool keeps its own
worktree allocation rules.

T3 Code can import the project actions in [`t3.json`](t3.json) through Project
settings. Its automatic `Setup worktree` action imports production state, prepares
the isolated environment, and starts the detached development server.

### Pull production state into local development

Use the safe dry run first:

```bash
pnpm prod:pull-state --dry-run
```

The command reads the root `.env`, connects to the personal VPS, and replaces the current worktree's local data only when run without `--dry-run`. It backs up the existing `DATA_DIR` before restoring the full production `/data` volume.

The personal VPS compose project is `/home/praya/marka`, configured through `KARAKEEP_PROD_COMPOSE_DIR`. The service and export image have documented defaults in the script, while machine-specific values belong in `.env` and must not be committed.

<!-- ROADMAP:START -->
## Roadmap

<a href="./docs/roadmap/roadmap.excalidraw">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/roadmap/roadmap-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./docs/roadmap/roadmap-light.png">
    <img src="./docs/roadmap/roadmap-light.png" alt="Marka Roadmap">
  </picture>
</a>

[Open the editable Excalidraw source](./docs/roadmap/roadmap.excalidraw)
<!-- ROADMAP:END -->

## License

Marka is licensed under [AGPL-3.0](LICENSE).

## Attribution

Marka builds on the open-source [Karakeep](https://github.com/karakeep-app/karakeep) project.
