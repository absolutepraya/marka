# Cloudflare hosting target uses one SQLite Durable Object as the library store

Status: accepted

Marka supports two hosting targets from one codebase: the existing Docker deployment on one host, and a Cloudflare deployment. The Docker target is unchanged. This record fixes the shape of the Cloudflare target so that later work does not reopen it.

## Decisions

### The library store stays SQLite on both targets

The Docker target keeps better-sqlite3. The Cloudflare target uses one SQLite-backed Durable Object per installation. Both apply the same Drizzle migration history, so queries move between targets unchanged. A squashed baseline for fresh Cloudflare installations is allowed only if Durable Object SQLite rejects a pragma used by a historical migration.

D1 was rejected because it cannot run interactive transactions: `batch()` cannot read, branch, and then write, so roughly 55 read-then-write transactions would need redesigning and the shared interface would inherit D1's limits on both targets. Postgres through Hyperdrive was rejected because it would either move the Docker target off a single SQLite file or split the codebase across two SQL dialects. One Durable Object per user was rejected because shared lists, invitations, and content edit grants query across users, and no transaction can span two Durable Objects.

### Transactions are real and serialized on both targets

A library store transaction is atomic across `await`. Each adapter runs transactions one at a time, and calls made inside a transaction join it. On the Docker target this uses one connection, an async write lock, and async context tracking. On the Cloudflare target it follows from the Durable Object's single-threaded execution.

### Code runs where the library store is

On Cloudflare, the Hono and tRPC API runs inside the library store's Durable Object; the Next.js Worker renders pages and forwards API requests. Background jobs that need no external binaries run inside the Durable Object as well. Jobs that need binaries (crawler, video, transcript, asset preprocessing) run in Cloudflare Containers and reach the library store through a remote adapter. The remote adapter has no interactive transactions: each transaction those jobs need is a named persist function that runs inside the Durable Object on Cloudflare and is called directly on the Docker target. The remote endpoint is never publicly routable and requires a shared secret.

## Consequences

- The Cloudflare target has a single-writer library store capped at the Durable Object storage limit. This fits self-hosted libraries because asset files live in R2, outside the library store.
- Moving an existing Docker installation to Cloudflare copies the whole library store and its assets. The per-user bookmark export format is not a migration path because it loses data shared between users.
- ADR 0009 (release channel and rollback) covers only the Docker target. The Cloudflare target needs its own release and rollback contract before it is supported.
