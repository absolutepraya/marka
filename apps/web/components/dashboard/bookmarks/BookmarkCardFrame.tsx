import type { HTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export const bookmarkCardSurface =
  "shadow-xs ease-(--ease-out) overflow-hidden rounded-xl border border-border/80 bg-card transition-[border-color,box-shadow,background-color] duration-200 hover:border-border hover:shadow-md sm:rounded-2xl";

export function BookmarkCardFrame({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <Slot
      className={cn(bookmarkCardSurface, "mb-1 sm:mb-3", className)}
      {...props}
    />
  );
}
