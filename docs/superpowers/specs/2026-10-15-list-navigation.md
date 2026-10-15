# List page navigation

Agreed behavior for the web app on desktop and mobile:

- Show direct sublists as compact links below the list header and above bookmarks, including when the current list has no bookmarks.
- Show up to three sublists initially without a background surface or border. A centered ghost disclosure inside the list matches the capture composer's file disclosure, shows the hidden count, and expands/collapses the remaining sublists inline. Reset expansion when navigating to another list.
- Keep ancestor navigation in breadcrumbs. On narrow screens, retain the immediate parent and current list, with earlier ancestors available through a labeled overflow control. Breadcrumbs use a compact 20px row with 12px text and stay on one line, truncating segment text with an ellipsis. Full current names remain in the page heading, and ancestor links open their full list page. Earlier ancestors remain available in the overflow menu.
- Add a Switch list control that reuses the desktop sidebar's ListTreePicker component, including its search field, expandable hierarchy, current-list highlight, bookmark counts, favorites and shared-list grouping. Search spans the complete visible list tree, including unrelated branches. Navigation closes the overlay; expanding a branch does not. Include an All lists link even when no search results match.
- Use only the permission-filtered list index for hierarchy relationships. Reusing the sidebar must preserve visibility boundaries, drag/drop permissions and list action behavior.
- Use a popover on desktop and a bottom sheet on mobile, reusing existing UI primitives, semantic theme tokens and native navigation links. The list title and emoji are 28px on mobile and 36px on desktop.
- Arrange the header in two justified rows: icon/name on the leading side with a smaller item count and privacy label stacked at the trailing end, then a compact Switch list trigger at the leading end with the existing actions at the trailing end. Match the switcher's height to the existing action buttons (32px on mobile, 36px on desktop).
- Reuse the app search bar's surface styling for list search in both the sidebar and switcher, including its soft focus ring. Use a full-width outlined All Lists action below the switcher tree.
- Preserve bookmark membership, recursive filtering, permissions and existing desktop sidebar behavior.

Verification covers downward and upward navigation, sibling switching, search and recovery, more than three children, deep paths, long names, keyboard operation, narrow widths, both themes and reduced motion. Unit tests cover shared tree search, expansion, current-list highlighting, overlay navigation and sublist disclosure behavior. No database or API changes are needed.

Screenshots: [mobile](assets/2026-10-15-list-navigation/mobile.png) and [desktop switcher](assets/2026-10-15-list-navigation/desktop.png).
