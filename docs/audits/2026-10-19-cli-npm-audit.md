# Marka CLI and npm audit

## Remediation status

The eight confirmed defect groups are fixed locally in this worktree. The
remaining audit is the historical pre-fix snapshot at `fd07a400`, including its
original npm metadata, counts, and reproduction evidence. Broader missing-command
recommendations remain a separate feature backlog.

| Finding | Implemented correction |
| --- | --- |
| F1 | Explicit server configuration; credentials are never sent to an automatic remote default. Malformed config errors do not echo stored values. |
| F2 | Transfer and permission failures produce nonzero status and structured summaries; intentional exclusions are counted separately. |
| F3 | A new owner-only, scoped, quota-checked import transaction preserves text format, source/working transcripts, revisions, highlights, progress, cached HTML, and attached/caption files. Feed settings and curated tag references are mapped to destination IDs. |
| F4 | Version 2 portable exports include the supported relational data, explicit exclusions, counts, and binary SHA-256 checksums. The new restore command validates archives before writes. Sharing and secret-protected webhook metadata are retained for reference without reactivating access or sending invitations. |
| F5 | Empty manual-list merges work with both keep-source and delete-source behavior. |
| F6 | Bookmark creation reports the state after its tag/list follow-ups. |
| F7 | Successful data commands emit one JSON result; no-result commands emit a success object. Prompts/progress use stderr. Help/version and Commander usage errors retain conventional text output. |
| F8 | HTTP(S) URLs are validated and trailing slashes normalized, including migration destinations. |

The CLI now declares Node.js 22 or newer and includes the repository license in
the npm tarball. Both executable aliases remain supported. Release versions are
still assigned by the independent CLI workflow; no source version bump or release
tag was created.

Verification completed locally:

- All 490 tRPC tests passed across 29 files, including new scope, ownership,
  quota, rollback, transcript-preservation, and empty-merge regressions.
- All 23 workspace typecheck tasks passed.
- All 20 workspace lint tasks and 21 formatting tasks passed.
- All 15 release/smoke tests passed on Node 22.21.1.
- A clean install of the new npm tarball passed both executable aliases and the
  CLI HTTP integration fixture on Node 24.18.1. That fixture exercises existing
  command paths plus restore, JSON results, corrupt-archive rejection before
  writes, caption/cached-HTML byte preservation, data round trips, and injected
  asset/permission failures. SQLite and the Hono/tRPC API are real; search,
  queues, and email delivery are mocked.
- `pnpm test:cli-package` and the CLI-package CI job now run packed installation
  and integration checks. The OpenAPI definition includes the restore-upload
  endpoint and was regenerated.

Follow-up PR review corrected HTML full-page archive imports, redundant inline
cached HTML, empty URL query/fragment delimiters, and destination-key guidance.
Restore now parses each archive once into private staging with generated names,
rejecting links, duplicate members, unexpected paths, and oversized files before
server writes. Export suppresses macOS resource-fork entries. The packed CLI
fixture covers these archive checks, empty restores, and replacement of the
source archive after validation; six focused portability tests also pass.

The new export/restore API requires compatible source/destination Marka servers.
Archives are portable library exports with documented exclusions, rather than
complete instance backups. A restore can partially complete across bookmarks;
individual bookmark imports are atomic and do not overwrite existing URLs.
Version 1 dumps cannot be restored because they lack the required records.
See [the CLI contract](../../apps/cli/README.md) for the precise guarantees.

The remediation is prepared for pull request review. No deployment or npm
publication was performed. Published npm `0.2.0` still contains the audited
implementation until a new release is shipped.

## Original audit snapshot

Audit date: 19 October 2026. Source: `fd07a400e279822e876aec04575374ab83afa34d`. Published package: `@absolutepraya/marka@0.2.0`, release commit `fd5d60cd9fbe12fdd0bf83a8ee9974404f223dd0`.

## Verdict

The npm distribution installs and runs correctly in the tested environment. The CLI is useful but is not functionally complete, and migration/export should not yet be treated as complete data-preservation workflows. Eight confirmed defect groups are listed below. Missing command coverage, regression-test gaps, and optional upgrades are reported separately.

This was an audit. Application source, production data, VPS configuration, npm releases, GitHub issues, and repository history were not changed. Only this report remains in the worktree. Probe code and synthetic evidence are under `/tmp/marka-cli-audit-20261019/`.

## Scope and evidence

- Inventoried all 57 executable commands and all 159 registered tRPC procedures across 20 router namespaces. Asset uploads also use REST, so tRPC coverage alone is not a product-completeness score.
- Ran 100 CLI invocations against the real Hono API, real tRPC serialization/authentication/scopes, and a disposable migrated SQLite database. All 57 commands had a successful invocation. 117 behavior checks recorded 107 expected outcomes and 10 unmet expectations. The unmet checks are concrete audit findings, not a green acceptance result.
- Search used the existing local Meilisearch service with a dedicated `cli_audit_20261019_` index. Only synthetic records were indexed; the audit-created index was deleted afterward. A missing-search-provider failure was also checked.
- Queue submission and queue-stat dependencies were mocked. Email delivery was mocked. Successful queue commands demonstrate CLI/API validation and submission, not completion by production workers or delivery of email.
- Tested owner, collaborator, content editor, non-admin, read-only scoped key, and invalid-key behavior. Verified stale text and transcript revisions fail without overwriting current content.
- Tested stdin and file body input, legacy text alias, metadata flags, bookmark/search cursors, all-page retrieval, PDF upload/download, source/destination migration, dump contents, and synthetic destination wipe.
- Existing build, typecheck, lint, and formatting passed. All 13 existing release/smoke tests passed. All 57 leaf-command help screens exited successfully.
- Functional integration ran on macOS arm64 with Node 24.18.1. Executable help/version smoke checks also passed on installed Node 18.20.8, 22.21.1, and host Node 26.11.1. Linux, Windows, interactive hidden-key prompting, network-scale performance, and live production mutations were not tested.

The temporary Vitest wrapper deliberately records failed expectations instead of throwing, so its process can finish collecting all findings. Its green wrapper status must not be represented as all 117 checks passing.

## npm distribution and release audit

| Check | Result |
| --- | --- |
| Registry version and default tag | `latest` is `0.2.0`; published 10 October 2026 |
| Clean registry install | Pass in an isolated prefix, without monorepo dependencies |
| Global installation | Pass using a temporary global prefix |
| npm exec | `npm exec --yes --package=@absolutepraya/marka@0.2.0 -- marka --version` returns `0.2.0` |
| Executable aliases | Both `marka` and `karakeep` return `0.2.0` |
| Packed executable | Valid Node shebang, executable mode `0755`, approximately 657 kB |
| Runtime package dependencies | None; JavaScript dependencies are bundled |
| Package contents | Exactly README.md, package.json, and dist/index.mjs; no workspace source or .env |
| Registry signature | Verified by `npm audit signatures` |
| Provenance attestation | Verified by `npm audit signatures` |
| Published/source executable equality | Exact equality after normalizing the two injected version strings |
| Latest release workflow | Success; correctly skipped publication because executable/runtime metadata are unchanged |
| Actual automated publication | Version 0.2.0 was published by the configured GitHub Actions workflow with provenance |
| Existing release tests | 10/10 pass, including independent versioning, artifact changes, reserved retries, and publication metadata |
| Existing executable smoke tests | 3/3 pass: help, missing credentials, and 401 recovery guidance |

The source manifest version `0.32.0` differs from npm `0.2.0` by design: CLI release versions are injected by the independent release workflow. This is not a version drift defect.

Live primary evidence: [npm version metadata](https://registry.npmjs.org/@absolutepraya%2fmarka/0.2.0), [latest release decision](https://github.com/absolutepraya/marka/actions/runs/39192925175), and [0.2.0 publication run](https://github.com/absolutepraya/marka/actions/runs/38008573838).

Package polish: declare an `engines.node` policy and test that minimum, use a standard SPDX license identifier, and ship the applicable license file. The tarball currently has no LICENSE file. These are metadata/distribution improvements; installation did not fail. Registry signature/provenance validation does not establish that every bundled dependency is free of vulnerabilities. No complete bundled-dependency security scan was performed.

## Confirmed findings

### F1: P1, An API key without a configured server is sent to the upstream Karakeep host

With an empty XDG configuration directory, KARAKEEP_API_KEY set, and KARAKEEP_SERVER_ADDR absent, whoami resolves its destination to https://cloud.karakeep.app/api/trpc/users.whoami. A fetch interceptor confirmed the destination without making an external request or using a real key. getAPIClient attaches the supplied key as the Bearer authorization header. auth init also uses this upstream origin as its default. A self-hosted Marka key can therefore be disclosed to an unintended host by an ordinary configuration omission.

Code: [apps/cli/src/lib/config.ts:11](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/lib/config.ts#L11). Evidence: config-probes.json; src/index.ts:26 to 29; src/lib/trpc.ts:15 to 23.

**Required outcome:** Require an explicit server when no server has been saved. Validate the origin before saving or sending credentials. Keep the compatibility environment-variable names and configuration path.

### F2: P1, Migration reports success after real asset and tag-write failures

An injected HTTP 503 on the source asset download resulted in 3 migrated, 1 skipped, exit code 0, and Success: Migration completed successfully. The asset catch block suppresses the cause and does not set failure status. A separate destination API key with tags:read and no tag-write scope caused every tag creation to fail with 403, yet migration printed 1 ensured and exited 0. migrateTags catches all failures as if they were duplicates. The explicit --exclude-assets case should remain an intentional skip; a failed transfer must be distinguishable.

Code: [apps/cli/src/commands/migrate.ts:776](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/commands/migrate.ts#L776). Evidence: integration-results.json checks asset migration failure returns nonzero and tag creation permission failures return nonzero; migrate.ts:487 to 515 and 727 to 781.

**Required outcome:** Track transferred, intentionally excluded, and failed items separately. Report each failure and return a nonzero exit code for any failed transfer. Only suppress a verified duplicate conflict. Provide a structured final summary.

### F3: P1, Successful migration changes text format and omits user content and settings

A successful four-bookmark migration with --batch-size 1 converted a plain text bookmark to markdown. The source format is not passed to createBookmark. Existing highlights, working/source transcripts, reading progress, and a feed importTags=true setting were absent or reset on the destination. The migration has no loops for the first three resources, and migrateFeeds omits importTags. Cached link content, secondary assets, collaborator grants, and content-edit grants also have no migration path in the inspected code.

Code: [apps/cli/src/commands/migrate.ts:711](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/commands/migrate.ts#L711). Evidence: integration-results.json migration checks; migrate.ts:410 to 424 and 678 to 822.

**Required outcome:** Define a versioned preservation contract. Preserve text format and feed settings, maintain an old-to-new bookmark ID map, and copy supported annotations, progress, transcripts, and assets. Clearly list anything that cannot be transferred before writing. Add fixture-based destination comparisons.

### F4: P1, The all-account dump omits annotations, transcripts, progress, and sharing state

The command advertises dumping all account data and assets. The generated archive contained bookmarks, lists/membership, tags, feeds, prompts, rules, webhooks, user settings, and one binary asset. It had no highlight records, transcript records or transcript text, reading-progress records, collaborator records, or content-editor grants. These are not nested in the bookmark response, so includeContent does not cover them. There is no CLI command to restore or import the dump archive. This export cannot currently establish a complete recovery path.

Code: [apps/cli/src/commands/dump.ts:102](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/commands/dump.ts#L102). Evidence: audit-dump.tar.gz listing and extracted bookmarks/index.jsonl; dump.ts:145 to 370; packages/shared/types/bookmarks.ts:114 to 140.

**Required outcome:** State and version the export contract, include supported relational data and explicit exclusions, and implement or document a validated restore path. Keep credentials out of exports. Validate a dump/restore round trip before describing it as complete account recovery.

### F5: P2, Merging an empty manual list fails with an internal database error

lists merge --source EMPTY_MANUAL_LIST --target MANUAL_LIST exited 1 with values() must be called with at least one value. A populated source succeeded. ManualList.mergeInto always calls insert(...).values(bookmarkIds.map(...)), including when bookmarkIds is empty. This is a server defect exposed by the CLI.

Code: [packages/trpc/models/lists.ts:991](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/models/lists.ts#L991). Evidence: integration-results.json observation merge empty manual source should succeed; lists.ts:976 to 1010.

**Required outcome:** Skip the membership insert for an empty source, while still applying the requested source deletion and normal access checks. Cover both keep-source and delete-source cases.

### F6: P2, Bookmark creation prints stale JSON before tags are attached

bookmarks add --text ... --tag-name audit-tag --list-id LIST_ID exited 0 and persisted the tag and list membership. Its JSON result still contained tags: []. printObject(results) executes before the tag/list follow-up operations. Scripts consuming the output cannot treat it as the final saved state.

Code: [apps/cli/src/commands/bookmarks.ts:320](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/commands/bookmarks.ts#L320). Evidence: integration-results.json check add output includes persisted tags; bookmarks.ts:320 to 328.

**Required outcome:** Finish and assess the follow-up operations before output, then return the final bookmark state and per-item outcomes. Preserve the existing nonzero status for partial failures.

### F7: P2, The global JSON flag has inconsistent output across commands

Successful highlights delete writes a plain English success sentence to stdout even with --json. dump, migrate, and wipe also print prose/progress to stdout under --json. Many other successful mutations produce empty stdout and human status on stderr. Empty mutation output may be a valid chosen contract, but the CLI does not define that distinction, and the four prose-producing commands cannot be consumed with JSON.parse as advertised.

Code: [apps/cli/src/commands/highlights.ts:143](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/commands/highlights.ts#L143). Evidence: integration-results.json captured stdout/stderr for --json commands; output.ts:16 to 35; dump/migrate/wipe line and progress helpers.

**Required outcome:** Define one JSON success/error contract. Emit parseable structured results for every applicable command, direct progress to stderr, and document whether successful no-result mutations intentionally have empty stdout.

### F8: P2, Server addresses are saved without URL validation or slash normalization

auth init --server-addr not-a-url --force exited 0 and wrote the invalid value. A correctly authenticated whoami using a local origin ending in / failed, while the same origin without / succeeded. The client concatenates /api/trpc onto the raw value, creating //api/trpc. An intercepted request independently confirmed this path.

Code: [apps/cli/src/lib/config.ts:16](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/apps/cli/src/lib/config.ts#L16). Evidence: config-probes.json; integration-results.json check Connection accepts a normal trailing slash; src/lib/trpc.ts:15 and 37.

**Required outcome:** Parse and validate HTTP(S) server URLs once, normalize trailing slashes, and define whether installation base paths are supported. Share that normalization across auth, tRPC, uploads, downloads, and migration destinations.

## Data-preservation matrix

| Resource or field | Dump archive | Live migration |
| --- | --- |
| Basic bookmark title, note, archive/favourite state, creation time | Exported | Selected fields copied |
| Text body | Exported | Copied |
| Plain/Markdown format | Exported with bookmark content | Plain changed to Markdown in the probe |
| Primary asset binary | Exported | Copied on success; failed download can still return exit 0 |
| Secondary attachments and cached page assets | Owned assets exported through asset listing | No general secondary-asset copy loop |
| Highlights and annotation notes | Omitted | Omitted |
| Source and working transcript records | Omitted | Omitted |
| Personal reading progress | Omitted | Omitted |
| List metadata and manual membership | Exported | Copied |
| Collaborators, pending invitations, content editor grants | Omitted as relational records | Omitted |
| RSS feed configuration | Exported | importTags omitted |
| Feed import history | Omitted | Omitted |
| Rules, prompts, user preferences | Exported | Copied subject to exclusions; rule migration is skipped when required map categories are excluded |
| Webhook configuration | Listed fields exported | URL/events copied; secret token transfer is not provided |
| API keys and account authentication | Not exported | Not copied; credentials should stay excluded |
| Restore from dump archive | No corresponding CLI command | Live-server migration does not consume a dump |

## Functionality coverage and upgrades

The registered procedure inventory contains 54 procedures used by direct operational commands, 19 used only inside dump/migrate/wipe, and 86 with no CLI call site. These are implementation counts, not an assertion that every internal or browser-only procedure belongs in the CLI. Session-only and public/authentication/billing callbacks require separate decisions.

| Area | Current CLI coverage | Upgrade needed |
| --- | --- |
| Bookmarks | Create/read/delete, limited metadata update, text body edits, tags, URL check, list/search, progress, content-access inspection | Owner refresh/recrawl/summarize, processing status, broken links, full supported metadata fields, asset attachment management |
| Lists | Manual/smart creation, hierarchy/visibility edits, merge, membership, collaborator invite/list/remove/update-role | Invitation accept/decline/revoke/resend/edit/list, leave shared list, recursive collaborator updates, RSS-token lifecycle, lists-of-bookmark |
| Content sharing | Inspect permission state and edit with a revision | Grant/revoke content editing; today an owner must use another surface to finish the CLI editing workflow |
| Tags | List/get/merge/delete and bookmark attachment | Standalone create, rename/update, delete-unused, filtering/sorting/pagination controls |
| Highlights | All seven server procedures have a CLI path | Transcript-revision filter for per-bookmark listing, consistent JSON deletion output |
| Transcripts | All four server procedures have a CLI path | Preservation in export/migration and continued stale-write checks |
| Assets | Upload while creating asset bookmarks; read/download during utilities | List/get/download, attach/detach/replace, cleanup of unattached uploads |
| Feeds | Read/create/delete only through utility internals | Dedicated CRUD, import-tag settings, fetch-now |
| Rules | Read/create/delete only through utility internals | Dedicated CRUD and rule validation |
| Prompts | All four procedures reached through utilities | Dedicated prompt management and enable/disable |
| Webhooks | Read/create/delete only through utility internals | Dedicated CRUD and explicit secret-handling contract |
| Backups/export/import | Dump, live-server migration, wipe | Backup jobs list/get/trigger/download, archive restore, browser/bookmark-file imports and import-session monitoring |
| Admin | User list/stats, bookmark debug/reprocessing, queue stats, bulk queue actions | User create/update/reset/delete/invite, system statistics/connections/notices, maintenance task submission |
| User account | whoami; preferences/stats inside utilities | Stats, preference read/update, quota inspection; retain browser/session-only account security flows where required |
| Authentication | One compatibility config, env/flag overrides, setup | Explicit origin, URL validation, auth status/logout/profile selection, destination credentials via env/config rather than only argv |

API-key create/list/regenerate/revoke explicitly use sessionProcedure and reject API-key authentication. Do not expose these as ordinary API-key CLI commands without designing a separate browser/session login flow. Public payment webhooks, offline synchronization internals, subscription checkout, public-list viewing, and server client-config routes are not automatically CLI requirements.

## Regression coverage and operational improvements

Current CI executes 10 release tests and three binary smoke tests. There are no committed CLI command integration tests covering the 57 commands. The release workflow builds/typechecks, checks help/version and package metadata, and verifies installation; those checks do not detect the confirmed data/JSON problems.

Add durable tests for command payloads and output, scoped authorization, stale revisions, empty-list merge, page boundaries, and a realistic dump/migration preservation fixture. Test the packed/installed tarball as well as the development build. Make these run in the CLI-package CI job.

Additional upgrades from static inspection, not reproduced production failures:

- Bounded concurrency, 429 handling, configurable timeouts, and safe retry policy. Bookmark creation starts all supplied writes together; the server has a configured limit of 30 create requests per minute. Do not retry mutations blindly after an uncertain network outcome.
- Shared integer validation for dump/migrate/wipe batch sizes. These still use Math.min(Number(value), 100), which accepts negative/fractional values and silently falls back on some invalid inputs.
- Cursor-loop guards and streaming/JSONL output for large result sets. Current --all loops accumulate every record in memory and repeatedly copy arrays; asset transfer reads entire binaries into memory.
- Human output should preserve actionable server error details. bookmarks list currently discards the caught error and reports only Failed to query bookmarks.
- Scoped-key diagnostics and clearer permissions documentation. whoami requires users:read, while a bookmarks-only read key can successfully read bookmarks but cannot run whoami.
- Broader user-facing CLI reference. The README explains selected newer commands but lacks end-to-end reference/examples for admin, dump, migrate, wipe, and missing preservation guarantees.

## Recommended delivery order

1. Correct destination resolution and URL normalization, migration error accounting, empty-list merge, stale add output, and JSON handling. Add focused regression tests with each fix.
2. Define the portable export/migration schema and supported exclusions. Implement preservation and validate destination contents, including annotations and transcripts.
3. Finish daily library operations: refresh/processing status, metadata, tag CRUD, asset management, content grants, and invitation lifecycle.
4. Add dedicated feed/rule/prompt/webhook/backup/import and admin-management commands after choosing which browser-only operations remain intentionally outside the CLI.
5. Add package runtime/OS checks, metadata polish, timeout/retry/concurrency controls, and a generated command reference.

## Complete command inventory

Every command below was exercised successfully at least once. Passing a command invocation establishes only the tested path. The notes identify known defects or constrained proof. Help was also checked for every command.

| Command | Tested result / limitation |
| --- | --- |
| `marka admin users list` | Success path exercised against disposable API. |
| `marka admin bookmarks debug` | Success path exercised against disposable API. |
| `marka admin bookmarks recrawl` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin bookmarks reindex` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin bookmarks regenerate-embedding` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin bookmarks retag` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin bookmarks resummarize` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs stats` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs recrawl-links` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs reindex-all` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs retag-all` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs resummarize-all` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs regenerate-embeddings` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka admin jobs reprocess-assets` | CLI/API success; queue backend mocked, worker completion not tested. |
| `marka auth init` | Noninteractive flags/env/config mode 0600 verified; interactive prompt untested; F1/F8. |
| `marka bookmarks add` | Link/text/legacy alias/PDF/stdin; partial failures return nonzero; stale tags in JSON (F6). |
| `marka bookmarks get` | Success path exercised against disposable API. |
| `marka bookmarks update` | Success path exercised against disposable API. |
| `marka bookmarks update-tags` | Success path exercised against disposable API. |
| `marka bookmarks list` | Success path exercised against disposable API. |
| `marka bookmarks search` | Real isolated Meilisearch; cursor and --all; missing-provider failure also verified. |
| `marka bookmarks delete` | Success path exercised against disposable API. |
| `marka bookmarks edit-content` | Inline/file/stdin, stale revision, explicit grant, lost access, metadata denial verified. |
| `marka bookmarks check-url` | Success path exercised against disposable API. |
| `marka bookmarks progress get` | Success path exercised against disposable API. |
| `marka bookmarks progress set` | Success path exercised against disposable API. |
| `marka bookmarks content-access` | Success path exercised against disposable API. |
| `marka highlights list` | Success path exercised against disposable API. |
| `marka highlights get` | Success path exercised against disposable API. |
| `marka highlights delete` | Deletion succeeds; --json prints prose (F7). |
| `marka highlights create` | Success path exercised against disposable API. |
| `marka highlights update` | Success path exercised against disposable API. |
| `marka highlights search` | Success path exercised against disposable API. |
| `marka lists list` | Success path exercised against disposable API. |
| `marka lists create` | Success path exercised against disposable API. |
| `marka lists delete` | Success path exercised against disposable API. |
| `marka lists get` | Success path exercised against disposable API. |
| `marka lists add-bookmark` | Success path exercised against disposable API. |
| `marka lists remove-bookmark` | Success path exercised against disposable API. |
| `marka lists update` | Success path exercised against disposable API. |
| `marka lists merge` | Populated source succeeds; empty source fails (F5). |
| `marka lists collaborators list` | Success path exercised against disposable API. |
| `marka lists collaborators invite` | Invitation created; email backend mocked; no message sent. |
| `marka lists collaborators remove` | Success path exercised against disposable API. |
| `marka lists collaborators update-role` | Success path exercised against disposable API. |
| `marka tags list` | Success path exercised against disposable API. |
| `marka tags get` | Success path exercised against disposable API. |
| `marka tags merge` | Success path exercised against disposable API. |
| `marka tags delete` | Success path exercised against disposable API. |
| `marka transcripts get` | Success path exercised against disposable API. |
| `marka transcripts update` | Working update succeeds; stale revision fails. |
| `marka transcripts reset` | Requires --yes; reset succeeds. |
| `marka transcripts retry` | Success path exercised against disposable API. |
| `marka whoami` | Success path exercised against disposable API. |
| `marka migrate` | Paginated transfer succeeds, but fidelity and failed-item status fail (F2/F3/F7). |
| `marka wipe` | Synthetic destination bookmarks removed; JSON progress is prose (F7). |
| `marka dump` | Archive and asset verified; omissions and JSON defects (F4/F7). |

## Complete tRPC procedure inventory

Direct = at least one operational CLI call site outside dump/migrate/wipe. Utility only = called solely inside those three utilities. Missing = no CLI call site. This inventory does not measure field-level coverage or promise that every server procedure is appropriate for a CLI.

| Procedure | Kind | CLI access | Auth base | Source |
| --- | --- | --- | --- | --- |
| `admin.stats` | query | Missing | `adminSystemProcedure` | [admin.ts:48](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L48) |
| `admin.backgroundJobsStats` | query | Direct | `adminJobsProcedure` | [admin.ts:67](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L67) |
| `admin.recrawlLinks` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:248](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L248) |
| `admin.reindexAllBookmarks` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:278](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L278) |
| `admin.regenerateAllBookmarkEmbeddings` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:295](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L295) |
| `admin.reprocessAssetsFixMode` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:366](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L366) |
| `admin.reRunInferenceOnAllBookmarks` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:388](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L388) |
| `admin.runAdminMaintenanceTask` | mutation | Missing | `adminJobsProcedure` | [admin.ts:423](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L423) |
| `admin.userStats` | query | Direct | `adminUsersProcedure` | [admin.ts:428](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L428) |
| `admin.createUser` | mutation | Missing | `adminUsersProcedure` | [admin.ts:470](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L470) |
| `admin.updateUser` | mutation | Missing | `adminUsersProcedure` | [admin.ts:483](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L483) |
| `admin.resetPassword` | mutation | Missing | `adminUsersProcedure` | [admin.ts:530](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L530) |
| `admin.getAdminNoticies` | query | Missing | `adminSystemProcedure` | [admin.ts:553](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L553) |
| `admin.checkConnections` | query | Missing | `adminSystemProcedure` | [admin.ts:564](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L564) |
| `admin.getBookmarkDebugInfo` | query | Direct | `adminBookmarksProcedure` | [admin.ts:710](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L710) |
| `admin.adminRecrawlBookmark` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:790](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L790) |
| `admin.adminReindexBookmark` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:819](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L819) |
| `admin.adminRegenerateBookmarkEmbedding` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:839](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L839) |
| `admin.adminRetagBookmark` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:872](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L872) |
| `admin.adminResummarizeBookmark` | mutation | Direct | `adminBookmarksProcedure` | [admin.ts:898](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/admin.ts#L898) |
| `apiKeys.create` | mutation | Missing | `sessionProcedure` | [apiKeys.ts:36](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L36) |
| `apiKeys.regenerate` | mutation | Missing | `sessionProcedure` | [apiKeys.ts:61](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L61) |
| `apiKeys.revoke` | mutation | Missing | `sessionProcedure` | [apiKeys.ts:89](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L89) |
| `apiKeys.list` | query | Missing | `sessionProcedure` | [apiKeys.ts:102](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L102) |
| `apiKeys.exchange` | mutation | Missing | `publicProcedure` | [apiKeys.ts:134](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L134) |
| `apiKeys.validate` | mutation | Missing | `publicProcedure` | [apiKeys.ts:195](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/apiKeys.ts#L195) |
| `assets.list` | query | Utility only | `assetsProcedure` | [assets.ts:15](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/assets.ts#L15) |
| `assets.attachAsset` | mutation | Missing | `assetsProcedure` | [assets.ts:44](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/assets.ts#L44) |
| `assets.deleteUnattachedAsset` | mutation | Missing | `assetsProcedure` | [assets.ts:59](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/assets.ts#L59) |
| `assets.replaceAsset` | mutation | Missing | `assetsProcedure` | [assets.ts:65](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/assets.ts#L65) |
| `assets.detachAsset` | mutation | Missing | `assetsProcedure` | [assets.ts:78](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/assets.ts#L78) |
| `backups.list` | query | Missing | `backupsProcedure` | [backups.ts:15](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/backups.ts#L15) |
| `backups.get` | query | Missing | `backupsProcedure` | [backups.ts:22](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/backups.ts#L22) |
| `backups.delete` | mutation | Missing | `backupsProcedure` | [backups.ts:34](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/backups.ts#L34) |
| `backups.triggerBackup` | mutation | Missing | `backupsProcedure` | [backups.ts:45](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/backups.ts#L45) |
| `bookmarks.createBookmark` | mutation | Direct | `bookmarksProcedure` | [bookmarks.ts:308](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L308) |
| `bookmarks.updateBookmark` | mutation | Direct | `bookmarksProcedure` | [bookmarks.ts:650](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L650) |
| `bookmarks.updateBookmarkText` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:964](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L964) |
| `bookmarks.deleteBookmark` | mutation | Direct | `bookmarksProcedure` | [bookmarks.ts:1094](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1094) |
| `bookmarks.refreshBookmark` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:1118](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1118) |
| `bookmarks.recrawlBookmark` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:1276](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1276) |
| `bookmarks.updateReadingProgress` | mutation | Direct | `bookmarksProcedure` | [bookmarks.ts:1304](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1304) |
| `bookmarks.getReadingProgress` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1355](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1355) |
| `bookmarks.getBookmark` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1376](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1376) |
| `bookmarks.getContentPermissions` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1391](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1391) |
| `bookmarks.grantContentEditor` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:1398](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1398) |
| `bookmarks.revokeContentEditor` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:1411](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1411) |
| `bookmarks.searchBookmarks` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1424](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1424) |
| `bookmarks.checkUrl` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1523](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1523) |
| `bookmarks.getBookmarks` | query | Direct | `bookmarksProcedure` | [bookmarks.ts:1571](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1571) |
| `bookmarks.getProcessingStatus` | query | Missing | `bookmarksProcedure` | [bookmarks.ts:1583](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1583) |
| `bookmarks.updateTags` | mutation | Direct | `bookmarksProcedure` | [bookmarks.ts:1649](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1649) |
| `bookmarks.getBrokenLinks` | query | Missing | `bookmarksProcedure` | [bookmarks.ts:1863](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1863) |
| `bookmarks.summarizeBookmark` | mutation | Missing | `bookmarksProcedure` | [bookmarks.ts:1911](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/bookmarks.ts#L1911) |
| `config.clientConfig` | query | Missing | `publicProcedure` | [config.ts:7](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/config.ts#L7) |
| `feeds.create` | mutation | Utility only | `feedsProcedure` | [feeds.ts:49](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L49) |
| `feeds.update` | mutation | Missing | `feedsProcedure` | [feeds.ts:55](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L55) |
| `feeds.get` | query | Missing | `feedsProcedure` | [feeds.ts:62](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L62) |
| `feeds.list` | query | Utility only | `feedsProcedure` | [feeds.ts:69](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L69) |
| `feeds.delete` | mutation | Utility only | `feedsProcedure` | [feeds.ts:75](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L75) |
| `feeds.fetchNow` | mutation | Missing | `feedsProcedure` | [feeds.ts:81](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/feeds.ts#L81) |
| `highlights.create` | mutation | Direct | `highlightsProcedure` | [highlights.ts:54](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L54) |
| `highlights.getForBookmark` | query | Direct | `highlightsProcedure` | [highlights.ts:61](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L61) |
| `highlights.get` | query | Direct | `highlightsProcedure` | [highlights.ts:77](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L77) |
| `highlights.getAll` | query | Direct | `highlightsProcedure` | [highlights.ts:84](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L84) |
| `highlights.search` | query | Direct | `highlightsProcedure` | [highlights.ts:99](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L99) |
| `highlights.delete` | mutation | Direct | `highlightsProcedure` | [highlights.ts:116](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L116) |
| `highlights.update` | mutation | Direct | `highlightsProcedure` | [highlights.ts:123](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/highlights.ts#L123) |
| `importSessions.createImportSession` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:53](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L53) |
| `importSessions.getImportSessionStats` | query | Missing | `importSessionsProcedure` | [importSessions.ts:61](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L61) |
| `importSessions.listImportSessions` | query | Missing | `importSessionsProcedure` | [importSessions.ts:69](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L69) |
| `importSessions.deleteImportSession` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:77](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L77) |
| `importSessions.stageImportedBookmarks` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:86](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L86) |
| `importSessions.finalizeImportStaging` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:115](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L115) |
| `importSessions.pauseImportSession` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:122](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L122) |
| `importSessions.resumeImportSession` | mutation | Missing | `importSessionsProcedure` | [importSessions.ts:129](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L129) |
| `importSessions.getImportSessionResults` | query | Missing | `importSessionsProcedure` | [importSessions.ts:136](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/importSessions.ts#L136) |
| `invites.create` | mutation | Missing | `adminUsersProcedure` | [invites.ts:22](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L22) |
| `invites.list` | query | Missing | `adminUsersProcedure` | [invites.ts:80](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L80) |
| `invites.get` | query | Missing | `publicProcedure` | [invites.ts:116](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L116) |
| `invites.accept` | mutation | Missing | `publicProcedure` | [invites.ts:153](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L153) |
| `invites.revoke` | mutation | Missing | `adminUsersProcedure` | [invites.ts:211](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L211) |
| `invites.resend` | mutation | Missing | `adminUsersProcedure` | [invites.ts:235](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/invites.ts#L235) |
| `lists.create` | mutation | Direct | `listsProcedure` | [lists.ts:179](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L179) |
| `lists.edit` | mutation | Direct | `listsProcedure` | [lists.ts:204](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L204) |
| `lists.merge` | mutation | Direct | `listsProcedure` | [lists.ts:264](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L264) |
| `lists.delete` | mutation | Direct | `listsProcedure` | [lists.ts:294](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L294) |
| `lists.addToList` | mutation | Direct | `listsProcedure` | [lists.ts:336](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L336) |
| `lists.removeFromList` | mutation | Direct | `listsProcedure` | [lists.ts:365](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L365) |
| `lists.get` | query | Direct | `listsProcedure` | [lists.ts:393](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L393) |
| `lists.list` | query | Direct | `listsProcedure` | [lists.ts:404](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L404) |
| `lists.getListsOfBookmark` | query | Missing | `listsProcedure` | [lists.ts:418](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L418) |
| `lists.stats` | query | Direct | `listsProcedure` | [lists.ts:430](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L430) |
| `lists.regenRssToken` | mutation | Missing | `listsProcedure` | [lists.ts:443](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L443) |
| `lists.clearRssToken` | mutation | Missing | `listsProcedure` | [lists.ts:460](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L460) |
| `lists.getRssToken` | query | Missing | `listsProcedure` | [lists.ts:471](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L471) |
| `lists.addCollaborator` | mutation | Direct | `listsProcedure` | [lists.ts:489](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L489) |
| `lists.removeCollaborator` | mutation | Direct | `listsProcedure` | [lists.ts:533](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L533) |
| `lists.updateCollaborator` | mutation | Missing | `listsProcedure` | [lists.ts:576](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L576) |
| `lists.updateCollaboratorRole` | mutation | Direct | `listsProcedure` | [lists.ts:633](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L633) |
| `lists.getCollaborators` | query | Direct | `listsProcedure` | [lists.ts:668](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L668) |
| `lists.acceptInvitation` | mutation | Missing | `listsProcedure` | [lists.ts:713](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L713) |
| `lists.declineInvitation` | mutation | Missing | `listsProcedure` | [lists.ts:761](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L761) |
| `lists.revokeInvitation` | mutation | Missing | `listsProcedure` | [lists.ts:772](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L772) |
| `lists.updateInvitation` | mutation | Missing | `listsProcedure` | [lists.ts:783](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L783) |
| `lists.resendInvitation` | mutation | Missing | `listsProcedure` | [lists.ts:799](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L799) |
| `lists.getPendingInvitations` | query | Missing | `listsProcedure` | [lists.ts:818](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L818) |
| `lists.leaveList` | mutation | Missing | `listsProcedure` | [lists.ts:849](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/lists.ts#L849) |
| `offlineSync.snapshot` | query | Missing | `offlineSyncProcedure` | [offlineSync.ts:19](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/offlineSync.ts#L19) |
| `offlineSync.pull` | query | Missing | `offlineSyncProcedure` | [offlineSync.ts:22](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/offlineSync.ts#L22) |
| `offlineSync.push` | mutation | Missing | `offlineSyncProcedure` | [offlineSync.ts:28](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/offlineSync.ts#L28) |
| `prompts.create` | mutation | Utility only | `promptsProcedure` | [prompts.ts:49](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/prompts.ts#L49) |
| `prompts.update` | mutation | Utility only | `promptsProcedure` | [prompts.ts:64](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/prompts.ts#L64) |
| `prompts.list` | query | Utility only | `promptsProcedure` | [prompts.ts:88](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/prompts.ts#L88) |
| `prompts.delete` | mutation | Utility only | `promptsProcedure` | [prompts.ts:96](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/prompts.ts#L96) |
| `publicBookmarks.getPublicListMetadata` | query | Missing | `publicProcedure` | [publicBookmarks.ts:57](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/publicBookmarks.ts#L57) |
| `publicBookmarks.getPublicBookmarksInList` | query | Missing | `publicProcedure` | [publicBookmarks.ts:79](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/publicBookmarks.ts#L79) |
| `rules.create` | mutation | Utility only | `rulesProcedure` | [rules.ts:88](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/rules.ts#L88) |
| `rules.update` | mutation | Missing | `rulesProcedure` | [rules.ts:96](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/rules.ts#L96) |
| `rules.delete` | mutation | Utility only | `rulesProcedure` | [rules.ts:105](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/rules.ts#L105) |
| `rules.list` | query | Utility only | `rulesProcedure` | [rules.ts:111](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/rules.ts#L111) |
| `subscriptions.getSubscriptionStatus` | query | Missing | `subscriptionsProcedure` | [subscriptions.ts:281](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L281) |
| `subscriptions.getSubscriptionPrice` | query | Missing | `subscriptionsProcedure` | [subscriptions.ts:308](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L308) |
| `subscriptions.createCheckoutSession` | mutation | Missing | `subscriptionsProcedure` | [subscriptions.ts:348](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L348) |
| `subscriptions.syncWithStripe` | mutation | Missing | `subscriptionsProcedure` | [subscriptions.ts:449](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L449) |
| `subscriptions.createPortalSession` | mutation | Missing | `subscriptionsProcedure` | [subscriptions.ts:463](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L463) |
| `subscriptions.getQuotaUsage` | query | Missing | `subscriptionsProcedure` | [subscriptions.ts:489](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L489) |
| `subscriptions.handleWebhook` | mutation | Missing | `publicProcedure` | [subscriptions.ts:531](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/subscriptions.ts#L531) |
| `tags.create` | mutation | Utility only | `tagsProcedure` | [tags.ts:39](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L39) |
| `tags.get` | query | Direct | `tagsProcedure` | [tags.ts:49](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L49) |
| `tags.delete` | mutation | Direct | `tagsProcedure` | [tags.ts:60](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L60) |
| `tags.deleteUnused` | mutation | Utility only | `tagsProcedure` | [tags.ts:70](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L70) |
| `tags.update` | mutation | Missing | `tagsProcedure` | [tags.ts:80](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L80) |
| `tags.merge` | mutation | Direct | `tagsProcedure` | [tags.ts:88](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L88) |
| `tags.list` | query | Direct | `tagsProcedure` | [tags.ts:104](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/tags.ts#L104) |
| `transcripts.get` | query | Direct | `transcriptsProcedure` | [transcripts.ts:106](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/transcripts.ts#L106) |
| `transcripts.update` | mutation | Direct | `transcriptsProcedure` | [transcripts.ts:115](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/transcripts.ts#L115) |
| `transcripts.reset` | mutation | Direct | `transcriptsProcedure` | [transcripts.ts:208](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/transcripts.ts#L208) |
| `transcripts.retry` | mutation | Direct | `transcriptsProcedure` | [transcripts.ts:288](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/transcripts.ts#L288) |
| `users.create` | mutation | Missing | `publicProcedure` | [users.ts:32](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L32) |
| `users.list` | query | Direct | `adminUsersProcedure` | [users.ts:96](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L96) |
| `users.changePassword` | mutation | Missing | `usersProcedure` | [users.ts:118](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L118) |
| `users.delete` | mutation | Missing | `adminUsersProcedure` | [users.ts:137](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L137) |
| `users.deleteAccount` | mutation | Missing | `usersProcedure` | [users.ts:151](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L151) |
| `users.whoami` | query | Direct | `usersProcedure` | [users.ts:166](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L166) |
| `users.stats` | query | Utility only | `usersProcedure` | [users.ts:172](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L172) |
| `users.wrapped` | query | Missing | `usersProcedure` | [users.ts:178](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L178) |
| `users.hasWrapped` | query | Missing | `usersProcedure` | [users.ts:188](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L188) |
| `users.settings` | query | Utility only | `usersProcedure` | [users.ts:196](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L196) |
| `users.updateSettings` | mutation | Utility only | `usersProcedure` | [users.ts:202](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L202) |
| `users.updateAvatar` | mutation | Missing | `usersProcedure` | [users.ts:208](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L208) |
| `users.verifyEmail` | mutation | Missing | `publicProcedure` | [users.ts:218](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L218) |
| `users.resendVerificationEmail` | mutation | Missing | `publicProcedure` | [users.ts:236](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L236) |
| `users.forgotPassword` | mutation | Missing | `publicProcedure` | [users.ts:259](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L259) |
| `users.resetPassword` | mutation | Missing | `publicProcedure` | [users.ts:276](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/users.ts#L276) |
| `webhooks.create` | mutation | Utility only | `webhooksProcedure` | [webhooks.ts:59](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/webhooks.ts#L59) |
| `webhooks.update` | mutation | Missing | `webhooksProcedure` | [webhooks.ts:66](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/webhooks.ts#L66) |
| `webhooks.list` | query | Utility only | `webhooksProcedure` | [webhooks.ts:74](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/webhooks.ts#L74) |
| `webhooks.delete` | mutation | Utility only | `webhooksProcedure` | [webhooks.ts:80](https://github.com/absolutepraya/marka/blob/fd07a400e279822e876aec04575374ab83afa34d/packages/trpc/routers/webhooks.ts#L80) |

## Reproduction artifacts

Temporary artifacts: `/tmp/marka-cli-audit-20261019/`.

- `integration-results.json`: sanitized arguments, exit codes, stdout/stderr, decoded JSON and behavior checks.
- `cliAudit.test.ts`: the temporary integration probe source. To rerun with repository imports, copy it temporarily to `packages/trpc/cliAudit.temp.test.ts`, then remove it after the run.
- `api-coverage.json`, `commands.json`, `help-checks.json`: complete inventories and help results.
- `config-probes.mjs`, `config-probes.json`: isolated default-host and invalid-URL probes using dummy credentials and intercepted fetch.
- `existing-tests.txt`, `integration-log.txt`: test output. The integration log includes expected failure probes.
- `published-pack.json`, `source-pack.json`, isolated npm installs and package tarballs: packaging evidence.
- `latest-release-log.txt`, `published-release-log.txt`: primary GitHub Actions evidence.
- `audit-dump.tar.gz`: synthetic account export for inspection.

The integration run uses DATA_DIR=/tmp/marka-cli-audit-20261019/data and Node 24.18.1 directly. Running the global pnpm shim used the host Node 26 runtime for its child in this environment, which could not load the Node-24-built better-sqlite3 binary. The audit resolved that harness issue by invoking Vitest with the explicit Node 24 binary. This was not a CLI package defect.

```bash
cd packages/trpc
DATA_DIR=/tmp/marka-cli-audit-20261019/data NO_COLOR=false mise exec node@24.18.1 -- node ../../node_modules/vitest/vitest.mjs run cliAudit.temp.test.ts
```
