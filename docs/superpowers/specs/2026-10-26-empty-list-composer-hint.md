# Empty-list composer hint

Status: selected and implemented.

An empty editable manual list shows a small bookmark icon and two lines inside New Item: "This list is empty." and "Save your first bookmark below." The large empty-bookmarks banner is omitted for this state.

The composer remains visible on empty editable manual lists at every screen width. After the first bookmark appears, the hint disappears and the regular layout resumes, including the existing mobile capture button. Empty read-only lists and other bookmark views retain their existing empty state.

The hint uses the live grid's visible bookmarks rather than a separate request. Its copy is translated, its icon is decorative, and its status is available to assistive technology. The capture input, file upload, destination selection, and saving behavior are retained.

The temporary comparison controls and alternate implementations have been removed.

Validation: web lint and typecheck passed, along with all 37 existing composer and local/server grid tests. The final normal list route was checked at 1440px and 320px. Saving a real note removed the hint and restored the populated layout, including hiding the inline composer on mobile. The temporary verification account and its data were removed afterward.
