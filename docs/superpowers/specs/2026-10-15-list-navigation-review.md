# List navigation interface review

## Scope and coverage

Reviewed the uncommitted list-navigation change against base `76e630d4`: ListHeader, ListBreadcrumbs, ListNavigation, the shared ListTreePicker, sidebar AllLists wrapper, SidebarItem navigation behavior, the optional collapsible trigger class, shared app/list search-field surface, English strings and focused tests. Bookmark viewer behavior and sharing/editing semantics are outside this review.

Stack: Next.js 16, React 19, Tailwind 4, existing Radix wrappers, Lucide icons and semantic theme tokens. Conventions inspected: root/web AGENTS and CLAUDE files, CONTRIBUTING.md, CONTEXT.md, docs/agents/domain.md, stable-list collaboration design and installed Next.js linking documentation.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native links, current-page semantics, named search/overlays, branch disclosures, Escape restoration, heading focus and scoped axe checks | No remaining actionable finding in inspected states |
| Layout | Two justified header rows, shared tree in sidebar/popover/sheet, 320px/390px/desktop, deep paths and long names | Breadcrumb stays on one line; no navigation overflow in inspected states |
| Writing | List vocabulary, search across all visible lists, no-match recovery, loading/retry copy | Sidebar and switcher use the same search strings |
| Typography | Title/emoji 28px mobile and 36px desktop; 16px mobile search, wrapping title and ellipsized breadcrumb | Matches the revised brief |
| Colors | Semantic tokens, light/dark checks from the initial pass, final dark picker axe checks | No confirmed failing text pair; some offscreen contrast results remain incomplete |
| UI | Shared search/rows/counts/expansion, scrollbar fades, retained drag/drop role gates, static selection and reduced-motion source | Both surfaces use one component |

## Findings

No remaining actionable findings in the inspected change scope. Resolved findings:

| Severity | Domain | Location | Before | After | Why | Status |
| --- | --- | --- | --- | --- | --- | --- |
| HIGH | Colors | SidebarItem.tsx:68, ListBreadcrumbs.tsx:18 | Ring token measured 2.71:1 on dark accent and 2.74:1 on light accent | Foreground focus indicators measure 9.70:1 and 16.83:1 on accent | Focus must remain distinguishable against the rendered background | Introduced, resolved |
| MEDIUM | Accessibility | ListTreePicker.tsx:327, SidebarItem.tsx:23 | Inherited sidebar markup put native list items inside div wrappers | Named navigation region and ordinary row containers | Preserve valid navigation semantics when reusing the expandable tree | Inherited by extraction, resolved |
| MEDIUM | Accessibility | ListTreePicker.tsx:144, collapsible.tsx:58 | Negative trigger margins clipped part of the 24px expansion target | Shared picker opts into zero trigger margins with aligned leaf spacers | Keep expansion targets fully reachable | Inherited by extraction, resolved |
| HIGH | Layout | ListNavigation.tsx:100 | Grid intrinsic sizing could push the search field outside the mobile sheet | Zero-minimum grid columns and min-width:0 on the shared picker/container | Search must stay fully reachable at narrow widths | Introduced, resolved |

## Verification

- Final repository `pnpm format:fix`, `pnpm lint` and `pnpm typecheck` passed before PR creation.
- Focused command: `pnpm --filter @karakeep/web test run components/dashboard/lists/ListNavigation.test.tsx components/dashboard/lists/CollapsibleBookmarkLists.test.tsx`. Eight tests passed, covering sublist disclosure, full-tree search into unrelated branches, sidebar expansion/search clearing, current-list highlighting, modal focus/closing, Escape restoration and breadcrumb overflow.
- Latest full web test run: 298 tests passed in 56 suites; one search-page suite failed to load because `@teispace/next-themes` imports `next/navigation` without a resolvable extension in this environment. This full-suite check is not green. The final full-suite run includes the semantic/trigger corrections, shared search styling and three-sublist disclosure.
- T3 browser verified full-tree search from AI Dev into Scholarships, nested expansion, navigation to Europe, desktop/sidebar identical search classes, current-list highlighting, no-match recovery, and contained scrolling. Search stayed inside the mobile sheet at 320px and 390px.
- Browser checks verified three-to-14-child expansion, five-level ancestor overflow, long names, and 200% CSS zoom. Following mobile feedback, title and emoji use 28px; breadcrumb segments use a 20px row with 12px text and truncate on one line with their full labels retained in accessible text and destination pages.
- Final scoped axe checks on the shared picker reported no WCAG A/AA violations in stable dark desktop/mobile states. Color-contrast checks for some partially overlapped/offscreen elements were incomplete. Initial light/dark breadcrumb and sublist checks also reported no violations; the final shared picker was not re-audited in light mode.
- `git diff --check` passed.

Not verified: manual screen-reader announcements, native browser zoom, real-device keyboard behavior, final light-mode picker, RTL/pseudo-localized runtime layouts, runtime reduced-motion emulation, drag/drop mutations and injected loading/error responses. Focus style classes, permission gates, recovery markup and app-wide reduced-motion handling were reviewed from source. Background preview focus behavior prevented a complete visual focus-ring walk.

## Verdict

Approve for the inspected navigation scope, with the verification limits above. This is not a claim that the full web test suite or production deployment passed.
