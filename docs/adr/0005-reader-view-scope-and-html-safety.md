# Reader View scope and HTML safety

Status: accepted

Issue #67 is a focused polish pass after the shared content and viewing work in
#62 through #66. It improves the existing Reader View without expanding it into
a document parser, media player, or Office integration.

## Context

Reader View currently serves cached HTML from link bookmarks and text content
from Markdown or plain-text bookmarks. It already has typography settings,
reading progress, continue-reading, printing, original-link navigation, and
highlights. The remaining work needs a narrow product boundary so controls,
accessibility behavior, recovery, and security tests do not grow into a second
content platform.

## Decisions

### Reader View boundary

Reader View is a focused, read-only surface for readable cached HTML, Markdown,
and plain text. PDFs, images, videos, and audio remain in their dedicated
preview surfaces. Office ingestion, provider-backed viewing, and editing are
not part of this issue or Marka's active product scope.

### Controls and navigation

The selected control set is deliberately small:

- A table of contents uses h2 through h4 headings inside the article content,
  excludes the surrounding page title, nests headings by level, and is hidden
  when fewer than two headings are available. Selecting an entry moves to and
  focuses the destination heading. Motion honors the user's reduced-motion
  preference.
- In-article search is a literal, case-insensitive search over rendered article
  text. It reports the current and total match count, supports next and
  previous navigation, uses Enter and Shift+Enter for keyboard navigation, and
  uses Escape to close and restore focus. Regex and fuzzy matching are out of
  scope, and the toolbar and highlights sidebar are not searched.
- Continue reading is always user-initiated. Restoration tries a saved anchor,
  then a character offset, then a percentage fallback. The reader never jumps
  before the user chooses Continue. Start over clears saved progress, returns
  to the top, and offers an Undo action rather than a confirmation dialog.

Reading time, copy, share, and additional reader actions remain out of scope
for this issue.

### Progress and highlight recovery

Reading progress is per-user state. The saved anchor, character offset, and
percentage are recovery hints, not guarantees that the content is unchanged.

Highlight recovery uses the saved text and surrounding context. If a match is
missing or ambiguous, the highlight remains unresolved in the sidebar as
Needs review with its saved quote and context. The article receives no
potentially incorrect inline mark, and the system never silently relocates or
deletes the highlight. The owner can repair or delete an unresolved highlight.

On mobile, normal text selection remains native long-press selection. An
explicit Highlight action creates the annotation, while copy, link activation,
and image interaction remain available.

### Accessibility and verification

The Reader View surface targets WCAG 2.2 AA. The implementation must define
explicit accessible names, preserve logical DOM focus order, make navigated
headings focusable, close transient surfaces with Escape, and return focus to
the control that opened them.

Verification includes:

- an authenticated Chromium Playwright smoke suite;
- automated axe checks plus keyboard and focus assertions;
- a documented manual VoiceOver pass for the Reader View flow;
- screenshot baselines at 1280x900 desktop and 390x844 mobile sizes, in light
  and dark themes, covering the normal reader, open table of contents, active
  search, and print output; and
- one long representative fixture containing headings, lists, tables, code,
  and safe images.

### Reader-safe HTML

Reader View renders reader-safe HTML, never arbitrary saved markup. The policy
preserves readable headings, lists, tables, code, links, and safe images while
removing active behavior and untrusted embedding capabilities. Scripts, event
handlers, forms, executable SVG, third-party iframes, and `javascript:`,
`data:`, or `blob:` URLs are removed. Normal `http`, `https`, `mailto`, and
fragment links are allowed, as are remote or relative images. External links
receive safe `rel` attributes.

The same policy is enforced at the crawler or archive write boundary and again
defensively immediately before Reader View injection. The policy has a direct
sanitizer test and a Reader View integration test. Where an original raw asset
exists, it remains separately downloadable and is never used as trusted reader
markup.

The malicious fixture must prove that scripts, event handlers, forms,
executable SVG, and third-party iframes disappear while safe text, links,
images, tables, and code remain.

## Consequences

Issue #67 can improve the reading flow without creating a new content model or
provider dependency. The explicit surface boundary keeps PDF, image, video,
audio, and future document questions in their appropriate product decisions.
The sanitizer becomes a tested security contract rather than documentation
that callers may forget to apply. Conservative recovery may leave some
highlights marked Needs review, which is preferable to presenting a wrong
annotation as correct.
