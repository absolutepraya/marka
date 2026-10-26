# Generated loading skeletons

Marka uses `boneyard-js@1.10.0` for content loading placeholders throughout the
web app. These use synthetic fixtures and commit their generated geometry, so
normal builds and production requests never perform browser capture.

## Bookmark dashboard

`BookmarksGridSkeleton` retains the existing CSS grid and saved column-count
policy. Its cards use captures of the real `BookmarkCard` and shared
`BookmarkCardFrame` for masonry, grid, list, and compact views. This applies to
the initial dashboard/search fetch and to waiting for an offline replica. Cached
bookmarks remain visible during refreshes, and pagination retains its existing
Load More progress indicator.

Start local development, then regenerate against the workspace's web port:

```bash
pnpm skeletons:bookmarks http://localhost:3000
```

The development-only `/dev/boneyard/bookmarks?capture=1` page renders synthetic,
inert real cards at eleven container widths from 112 to 1360 pixels. The CLI
captures these at 390px and 1440px viewports, preserving the separate mobile and
desktop card styles. It treats inline-content divs as leaves so line-clamped
titles are measured at their visible size. All 88 samples must be valid before
the generator replaces
`apps/web/components/dashboard/bookmarks/bones/bookmark-cards.bones.json`.

Each placeholder measures its actual container, chooses the nearest sample,
and resets Boneyard when its width, layout, or media breakpoint changes. Mobile
square previews grow with the container while text and icons keep their height.
This supports the user's one to six desktop columns without capturing entire
dashboard arrangements. The adapter also corrects Boneyard's square-image circle
heuristic for rectangular card previews. It reserves the generated height,
retains a CSS-sized SSR fallback, uses theme tokens and the existing pulse and
reduced-motion rules, and announces loading once for the whole grid.

For visual checks, open `/dev/boneyard/bookmarks` with these query parameters:

- `layout=masonry|grid|list|compact`
- `columns=1` to `columns=6`
- `state=loaded` for real cards, `state=pagination` for their progress indicator,
  `state=offline` for the initial offline wait, or `state=offline-ready` for
  visible cached cards; omit `state` for loading

These previews use synthetic data in the dashboard shell. Offline and pagination
preview states illustrate presentation; the real behavior is covered by the
`UpdatableBookmarksGrid` and `LocalFirstBookmarksGrid` tests.

```bash
pnpm --filter @karakeep/web exec vitest run components/dashboard/bookmarks/BookmarkCardSkeleton.test.tsx components/dashboard/bookmarks/bookmarkSkeletonGeometry.test.ts components/dashboard/bookmarks/BookmarksGridSkeleton.test.tsx components/dashboard/bookmarks/UpdatableBookmarksGrid.test.tsx components/dashboard/bookmarks/LocalFirstBookmarksGrid.test.tsx
```

## Admin statistics

The admin overview's statistics card uses `boneyard-js@1.10.0`. Its generated
geometry comes from `BasicStatsFixture`, which renders the same
`BasicStatsContent` as the real card using synthetic counts and a release version.
Capture never needs an admin session or live statistics.

After changing this view's layout, start local development with `pnpm dev:start`
and regenerate against that workspace's web port:

```bash
pnpm skeletons:generate http://localhost:3000
```

Replace `3000` with the workspace's assigned port. The generator accepts only a
loopback HTTP URL. It captures `/dev/boneyard` at 320, 390, 640, 768, 1023, 1024,
1280, 1440, and 1920 pixels. The fixture mirrors the admin sidebar and content
padding, including the three-column switch at 1024 pixels. Boneyard uses its own
Playwright CLI for capture and may install Chromium if it is missing.

The generator validates all captures before replacing
`apps/web/components/admin/bones/admin-stats.bones.json`. Commit this JSON with
the layout change; do not edit its measurements by hand. The component imports
the JSON directly, so it does not need a generated side-effect registry. Normal
builds and production requests do not perform browser capture.

To inspect loading and loaded states, open `/dev/boneyard` and
`/dev/boneyard?state=loaded`. This route shows Next.js's not-found page outside
development.

`BasicStatsSkeleton` retains the existing placeholder for server rendering and
until Boneyard can select a responsive capture after hydration. Its viewport
selection matches the capture widths despite the sidebar narrowing the card.
It reserves the generated height and resets Boneyard when the selected capture
changes, avoiding stale desktop measurements after a resize to mobile.
Colors use Marka's `--muted` token, animation uses the existing Tailwind pulse
and global reduced-motion rules, and a translated status announces loading while
the decorative geometry is hidden from assistive technology.

Verify with:

```bash
pnpm --filter @karakeep/web exec vitest run components/admin/BasicStats.test.tsx
pnpm --filter @karakeep/web typecheck
```

## Review screenshots

These local dashboard previews use synthetic data.

- [Desktop grid, 1440px](pr-assets/boneyard/dashboard-grid-desktop.png)
- [Mobile masonry, 390px](pr-assets/boneyard/dashboard-masonry-mobile.png)
- [Mobile list, 390px](pr-assets/boneyard/dashboard-list-mobile.png)
- [Desktop compact, 1440px](pr-assets/boneyard/dashboard-compact-desktop.png)
- [Mobile service connections, 390px](pr-assets/boneyard/service-connections-mobile.png)
- [Desktop background jobs, 1440px](pr-assets/boneyard/background-jobs-desktop.png)
- [Desktop import session details, 1440px](pr-assets/boneyard/import-detail-desktop.png)
- [Mobile highlights, 390px](pr-assets/boneyard/highlights-mobile.png)

## Other content surfaces

`pnpm skeletons:surfaces http://localhost:3000` captures the remaining content
placeholders: admin users, invitations, service connections and background jobs;
personal usage statistics; subscription details, inline pricing and quota usage;
the lists index; tag groups; bookmark tags; RSS feeds, webhooks, backups, assets
and broken links; automation rules and custom AI prompts; import history,
session details and filtered results; and highlight search results and reader
highlight cards; bookmark list membership, list collaborators, and shared-content
editors. The command produces 234 samples across 26 surfaces and the
same nine viewport breakpoints as admin statistics.
Replace the port with the current workspace's web port.

The development-only `/dev/boneyard/surfaces` gallery shows these placeholders.
Use `?state=loaded` to compare synthetic loaded content, `?surface=admin-users`
(or another capture name) to inspect one surface, and `?capture=1` for generation.
The gallery reuses data-free presentation components and inert synthetic actions;
it does not mount admin queries, subscription synchronization, or checkout.
The app shell may still perform its normal session and offline-library reads.

`CapturedSkeleton` measures its content container, keeps mobile and desktop
styles separate, and selects the nearest captured content width. It reserves
the generated height and remounts Boneyard when the selected geometry changes.
Captured panel outlines retain the app's card and border tokens. A translated
status announces each loading region; geometry stays hidden from assistive
technology. The server retains a visible CSS fallback, and animation follows
the existing reduced-motion rules. Each consumer imports only its own capture.

Action spinners, import progress, media preparation, and page-level startup
indicators retain their existing behavior. Cached content, background refresh,
and pagination decisions remain owned by the existing query components.

The high-priority settings views share their real table headers and row display
components with the capture fixtures. Mutation controls remain in their existing
controllers. Import fixtures use fixed relative-date labels and inert action
slots, while live cards keep polling and their original lifecycle actions. A
separate results capture lets an import session keep showing progress while a
new filter loads. Highlight search captures appear only when the active query
has no data; server-seeded and cached results remain visible. Reader highlights
return to their existing hidden empty state after loading.
The highlights route streams its data below a visible heading and search frame,
using the same captured rows as the Suspense fallback.

Settings captures mirror the centered `max-w-4xl` column and the inner section
padding. Rules and prompt rows wrap at narrow widths. Dialog captures use their
actual mobile sheet widths, desktop maximum widths, borders, and inner padding.
Only their data-dependent bodies become skeletons; headings, invitation/grant
forms, and footers stay visible. List membership keeps its offline cache and
queued mutations. Collaborator roles, inheritance, expired invitations, removal
confirmation, and content-editor access remain owned by the existing controllers.
Native mobile and variable article/preview bodies are separate follow-up scopes.

All three capture commands validate their complete output before replacing
tracked JSON. Each replacement uses a temporary file in the destination
filesystem and an atomic rename, so a watcher cannot read a partially written
capture. Commit generated geometry with changes to its source layout.

```bash
node --test scripts/skeleton-capture.test.mjs
pnpm --filter @karakeep/web exec vitest run components/loading-ui/CapturedSkeleton.test.tsx components/loading-ui/DialogSkeletons.test.tsx components/loading-ui/surfaceGeometry.test.ts components/settings/SubscriptionSettings.test.tsx components/dashboard/tags/TagPill.test.tsx app/dev/boneyard/surfaces/SurfaceFixtures.test.tsx
```
