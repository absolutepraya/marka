// Shared visual contracts for controls, including web-only Radix wrappers.
// Keep interaction and positioning rules with the owning primitive.
export const floatingSurface =
  "rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-[var(--elevation-overlay,0_12px_32px_-12px_rgb(0_0_0/0.2))]";

export const menuItemStyles =
  "relative flex min-h-9 cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors sm:min-h-8 focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0 [&_svg]:pointer-events-none";

export const fieldStyles =
  "rounded-md border border-input bg-card text-foreground shadow-[var(--elevation-field,0_1px_2px_rgb(0_0_0/0.03))] transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export const navigationItemActive =
  "bg-card text-foreground shadow-xs ring-1 ring-inset ring-border/60";
export const navigationItemIdle =
  "text-muted-foreground hover:bg-accent/70 hover:text-foreground";
