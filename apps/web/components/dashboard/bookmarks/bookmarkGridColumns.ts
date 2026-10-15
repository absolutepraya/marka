import { SCREENS } from "@/lib/breakpoints";

// Keep the server-rendered placeholder and loaded grid on the same responsive
// policy so their column count does not jump when the data arrives.
export function getBookmarkGridColumnPolicy(
  userColumns: number,
  isMobile: boolean,
) {
  const phoneColumns = Math.max(1, Math.min(userColumns, 2));
  return {
    default: isMobile ? phoneColumns : userColumns,
    sm: phoneColumns,
    md: phoneColumns,
    lg: Math.max(1, Math.min(userColumns, userColumns - 1)),
  };
}

export function getBookmarkGridBreakpointConfig(
  userColumns: number,
  isMobile: boolean,
) {
  const columns = getBookmarkGridColumnPolicy(userColumns, isMobile);
  return {
    default: columns.default,
    [SCREENS.sm]: columns.sm,
    [SCREENS.md]: columns.md,
    [SCREENS.lg]: columns.lg,
  };
}
