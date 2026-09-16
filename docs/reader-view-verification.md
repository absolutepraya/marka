# Reader View verification

Issue #67 uses an opt-in browser smoke test because the repository does not
keep a shared authenticated browser account or a stable Reader View fixture in
CI. The test never prints credentials and does not create or delete bookmarks.

## Authenticated Chromium and axe

Start the local app, then provide an existing authenticated account and a long
Reader View fixture containing at least two headings. A storage state file can
be used instead of credentials:

```bash
pnpm dev:start -d
pnpm exec playwright install chromium

MARKA_READER_BASE_URL=http://localhost:3100 \
MARKA_READER_BOOKMARK_ID=<bookmark-id> \
MARKA_READER_EMAIL=<local-account-email> \
MARKA_READER_PASSWORD=<local-account-password> \
MARKA_READER_SCREENSHOT_DIR=docs/static/img/screenshots/reader-view \
pnpm reader:smoke
```

Or use `MARKA_READER_STORAGE_STATE=/absolute/path/to/storage-state.json` and
omit the email and password variables. The smoke test checks:

- authenticated Reader View loading;
- h2 to h4 navigation and focus return after Escape;
- focused heading navigation from the table of contents;
- literal search, current-match marking, and Escape focus return;
- axe violations scoped to the Reader View article;
- light and dark desktop and mobile screenshots;
- print media output; and
- optional allowed and forbidden image requests when
  `MARKA_READER_EXPECTED_IMAGE_URL` or `MARKA_READER_FORBIDDEN_URL` is set.

The search assertion uses the fixture's `Alpha` text. Keep that token in the
fixture, or update the smoke script with the fixture's stable search token.

## Manual VoiceOver pass

Run this pass on macOS with VoiceOver enabled after the Chromium smoke test:

1. Open the authenticated Reader View fixture at 1280x900 and move by
   landmarks. Confirm the page exposes the main content and article, and the
   article title is announced as the page heading.
2. Tab to the search field and confirm its accessible name is “Search within
   article”. Enter a literal query, confirm the live result count is announced,
   and use Enter and Shift+Enter to move between matches.
3. Press Escape in the search field. Confirm the query clears and focus stays
   on the search field.
4. Open the table of contents. Confirm its expanded state and heading entry
   names are announced. Activate an entry and confirm the destination heading
   receives focus. Press Escape and confirm focus returns to the table of
   contents button.
5. Open the highlights sidebar. Confirm it is absent from the reading order
   while closed, and that saved highlight text and the Needs review state are
   announced when present.
6. Resize to 390x844 and repeat the search and table-of-contents flow. On a
   touch device, select text with a long press and activate the explicit
   Highlight action. Confirm copy, links, and image interaction remain
   available.

Record the date, browser, fixture bookmark ID, and any observed issue in the
PR description. Do not put account credentials or private bookmark content in
the repository.
