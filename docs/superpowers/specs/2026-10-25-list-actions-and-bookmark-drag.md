# List actions and bookmark dragging

Status: accepted. Both interview rounds and the shared design were confirmed before implementation.

## Requested changes

1. Match the sidebar ellipsis's right corners to the normal row hover background and check All Lists for the same mismatch.
2. Add a "Move list to" action accessible from the list header.
3. Support dragging multiple selected bookmarks like a single bookmark.
4. Show a pointer cursor over bookmark cards during selection.
5. Show a grabbing cursor during dragging.
6. Enlarge the bookmark drag handle.

## Verified pre-change behavior

- Sidebar root and nested lists use the same list-tree row. All Lists uses a different ellipsis trigger, including different dimensions and hover, focus, and touch visibility. Both already use the same action menu as the list header.
- The reported corner mismatch exists on both surfaces: rows use rounded-lg (10px with the current theme), while ellipsis triggers use rounded-r-xl (14px). Shared ghost-button styling paints an accent background while the menu is open, revealing the mismatched right corners. All Lists also insets its trigger inside the row padding.
- Editing a list's parent already moves the list and its attached subtree, preserving their identities and bookmark memberships. Moving to the library root clears the parent. The server checks source ownership and rejects cycles, but currently does not validate destination ownership or access.
- Reparenting can change inherited collaboration access for the list and its descendants.
- Bulk-selection mode hides drag handles and covers cards with a selection button. Single-bookmark dragging currently uses an approximately 20px handle in grid, masonry, and list layouts; compact layout has no handle.
- Single dragging moves membership from an editable manual source list and adds membership from other views. Destination membership is added before source membership is removed. Only editable manual lists accept drops.
- Selection covers selected bookmarks loaded in the current grid. Other users' bookmarks can be selected for removal from an editable shared list, but the add-to-list API requires bookmark ownership.
- Existing drag mutations run online. Moves are not atomic: a source-removal failure after destination addition leaves both memberships intact.

## Agreed behavior

- Correct the sidebar ellipsis radius against the row's own hover background. Audit All Lists as well; the requested change is corner consistency rather than making All Lists the visual reference for the sidebar.
- Opening a list page must not automatically focus its title or show a focus outline around the heading.
- Sidebar and Switch list search results show a muted parent path below each matched search root, so identically named lists can be distinguished. Long paths truncate visually and retain their full text in the row title. Clearing the search restores the normal tree.
- Add "Move list to..." to the shared list menu, including the header, sidebar, and All Lists. Use a searchable destination picker with a Top level option. Only the source owner can move the list; destinations must also be owned lists. Exclude the source and its descendants and validate destination ownership on the server, including existing parent-edit paths.
- Moving a list preserves its identity, bookmark memberships, and attached subtree. Warn when inherited sharing access could change.
- Dragging a selected bookmark's handle drags the entire active selection. Dragging an unselected bookmark's handle drags only that bookmark without changing the selection. Card clicks continue to toggle selection; handles initiate dragging. Show the dragged bookmark count in the preview.
- Preserve existing membership semantics: dragging from an editable manual list moves source membership; dragging from other views adds destination membership. Other list memberships remain unchanged. Only editable manual lists accept bookmark drops.
- If a selection includes bookmarks the user cannot add to another list, block the entire drag with a clear explanation. Do not silently skip those bookmarks or broaden permissions.
- Cover grid, masonry, list, and compact web layouts. Use a 32px handle target with a 20px grip icon. Show pointer over selection cards, grab over handles, and grabbing during active dragging, subject to native browser drag indicators. Handles remain for fine-pointer input; preserve touch scrolling.
- Dragging remains online-only, with a clear unavailable state offline.

- Batches allow individual successes. Add destination membership before removing source membership for each bookmark. Report completed, failed, and added-but-not-removed results separately. Preserve destination memberships after source-removal failures so incomplete moves can be retried safely.
- Remove completed bookmarks from the selection and retain failed or incomplete bookmarks. Keep selection mode active. An unselected bookmark drag does not change the existing selection.
- Canceling before dropping and dropping onto the source list perform no requests and leave selection unchanged. Once a valid drop submits, finish processing and report its results.
- List moves require an explicit Move submission after destination selection, with inherited-sharing guidance visible beforehand. Keep the dialog open on failure; close on success and refresh the hierarchy and breadcrumbs without navigating away from the current list.

Agreed product language is recorded in the existing root CONTEXT.md. These UI decisions do not currently meet the threshold for an enduring architectural ADR.

## Implementation verification

- The final full web suite passed 381 tests. The focused list, recursive-sharing, and offline-access API suites passed 42 tests. Web and API type checks, lint, formatting, and whitespace checks passed.
- Native browser dragging moved two selected bookmarks and exact API read-back confirmed destination membership and source removal. Successful selections cleared while selection mode stayed active. Same-source drops made no membership requests. The active drag cursor was grabbing.
- Browser checks covered 32px handles across grid, masonry, list, and compact layouts; selection pointer cursors; offline unavailability; list moves to the library root; subtree preservation; and refreshed breadcrumbs without navigation.
- Sidebar and All Lists menu triggers match their rows' 10px corners and remain transparent while open. The move dialog was checked at 390px and 320px without horizontal overflow.
- The final browser pass reported no page hydration errors. A regression test covers a sidebar-warmed hierarchy cache arriving before the streamed list header hydrates.
- Temporary local verification accounts and their fixture data were removed. The workspace web and worker readiness endpoints remain healthy.
