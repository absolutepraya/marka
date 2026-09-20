# Contributing

Thanks for taking the time to improve Marka.

This repository maintains Marka's product, operator workflow, and repository-specific development practices.

## Which repo should you contribute to?

### Contribute here if...
- the change improves Marka's UX, operator workflow, or repository-specific maintenance model
- it depends on Marka's pull-based deploy flow or local-dev scripts
- it improves a product behavior or presentation maintained in this repository

## Before you start

- Open an issue or discussion first if the change is large, behavioral, or opinionated.
- If the change belongs to a different project, propose it there instead of here.
- Read the operator setup guide: [`docs/operator-setup.md`](docs/operator-setup.md)

## Local setup

Marka uses:
- Node 24.18.1 (`.nvmrc`; temporarily pinned to avoid the Node 24.19 native-addon cleanup regression)
- `pnpm@11.2.1` via corepack
- Docker-compatible local runtime, such as OrbStack on macOS
- [`wt`](https://github.com/absolutepraya/wt) for isolated worktrees
- root `.env` symlinked into `apps/web`, `apps/workers`, and `packages/db`

Quick start:

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

This repository supports [`wt`](https://github.com/absolutepraya/wt) for isolated worktrees. Use `wt new <name>` before making a parallel change; the project configuration prepares separate local data and web ports while sharing the machine-level Chrome and Meilisearch services.

For the full workflow, detached mode, and production deploy notes, use:
- [`docs/operator-setup.md`](docs/operator-setup.md)

## What to run before opening a PR

At minimum:

```bash
pnpm format:fix
pnpm lint
pnpm typecheck
```

Depending on the change, also run:

```bash
pnpm test
pnpm knip
pnpm doctor
pnpm doctor:staged
```

Notes:
- GitHub Actions temporarily runs the combined test job on Node 22.21.1 because Vitest plus `better-sqlite3` can abort during worker teardown on Node 24. Local development and production remain on Node 24.18.1. Remove the CI override once <https://github.com/nodejs/node/pull/65042> ships in Node 24.
- `pnpm doctor` and `pnpm doctor:staged` are advisory local checks. CI requires a React Doctor score of at least 99 through `pnpm doctor:ci`; see [`docs/react-doctor.md`](docs/react-doctor.md) for the baseline and accepted tool limitations.
- `knip` is useful for repository cleanup, but is non-blocking in CI.

### Roadmap changes

The issue-linked roadmap source is [`docs/roadmap/roadmap.excalidraw`](docs/roadmap/roadmap.excalidraw). Update it in a PR when the PR changes a roadmap issue's scope, ordering, grouping, or dependencies. An implementation PR does not need a diagram edit when the roadmap structure is unchanged.

Roadmap nodes use explicit issue metadata and dependency arrows. Keep the authored source as the only hand-edited diagram. Generated Excalidraw, SVG, PNG, and the marked Roadmap block in `README.md` are maintained by automation and should not be edited directly.

Run these checks when working on the roadmap:

```bash
pnpm roadmap:check
pnpm exec playwright install chromium
pnpm roadmap:render
```

The renderer exports through Excalidraw itself so the committed SVG and PNG retain Excalifont, hand-drawn strokes, and hand-drawn arrows. CI installs Chromium before rendering.

## Change expectations

### UI / UX changes
- Include screenshots or a short screen recording.
- Explain why the change fits Marka specifically.
- Keep the design language consistent with the current app rather than introducing a second style system.

### Schema / backend changes
- Add migrations when needed.
- Call out any deploy or operator impact clearly.
- Mention any compatibility or migration implications.

### Documentation changes
If you touch development or deployment facts, follow the authoritative documentation map:
- `README.md` provides public product framing.
- `CONTRIBUTING.md` provides contribution rules.
- `docs/operator-setup.md` provides operator setup.
- `docs/README.md` provides docs-site development.
- `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` provide concise assistant operations context.
- Relevant docs-site pages under `docs/docs/**` must stay aligned when their content changes.

## PR guidance

A good PR for this repo should include:
- a clear summary of the change
- why it belongs in Marka
- screenshots for UI changes
- commands run for validation
- any deploy, migration, or compatibility implications

### Release and deployment changes

The shared Marka web and workers release identity is an annotated
`vMAJOR.MINOR.PATCH` Git tag. Package manifest versions remain independent and
must not be silently bumped as part of a shared release.

After successful CI on `main`, `.github/workflows/automatic-release.yml`
determines the next release from the merged Conventional Commit messages:

- `feat` creates a minor release.
- `fix`, `perf`, `refactor`, `build`, `security`, `deps`, and `revert` create a patch release.
- `!` markers or a `BREAKING CHANGE:` footer create a major release.
- `docs`, `test`, `style`, `ci`, and documentation-only `chore` changes do not create a release.
- A `Release: major|minor|patch|none` commit footer is an explicit override.
- An unrecognized commit that changes runtime or deployment files falls back to a patch release.

The workflow creates the next annotated tag automatically. Do not manually
create release tags or bump package manifest versions. The tag workflow checks
that the tagged commit is reachable from `main` and has successful exact-commit
blocking CI before building paired immutable `web-v<version>` and
`workers-v<version>` images. It then promotes the paired `web-stable` and
`workers-stable` channel and creates the GitHub Release.

The stable channel is mutable and Watchtower updates the two services
independently, so adjacent releases must remain compatible. Exact rollback uses
matching immutable version tags or matching `web-sha-<sha>` and
`workers-sha-<sha>` tags. Release contract tests are offline and run with:

```bash
pnpm test:release-contract
```

## Review expectations

Pull requests targeting `main` may receive automated review from CodeRabbit in addition to the repository's GitHub Actions checks.

AI review is advisory:
- GitHub Actions remains the source of truth for deterministic lint, format, typecheck, test, generated-artifact, Knip, and React Doctor validation.
- AI reviewers add contextual review signal; they do not replace CI and are not required merge gates.
- Reviewer comments are claims to verify, not instructions to change intended behavior. Check them against the issue/spec, surrounding code, tests, docs, and actual semantics before implementing a suggested fix.
- This repository's reviewer setup must not automatically commit, push, apply suggestions, or run autonomous fixer agents.
- Additional AI reviewers may be evaluated only if they satisfy the least-privilege and review-only requirements in [`docs/ai-code-review.md`](docs/ai-code-review.md).
- Contributors may use the project-local [`address-pr-reviews`](.agents/skills/address-pr-reviews/SKILL.md) skill to verify findings and close addressed threads with explicit authorization and remote-state proof.

See [`docs/ai-code-review.md`](docs/ai-code-review.md) for the current reviewer policy, rejected-candidate history, permissions ceiling, and future evaluation criteria.

Human review cadence is best-effort rather than community-SLA driven.
