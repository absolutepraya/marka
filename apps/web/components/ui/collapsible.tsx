"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronRight, Triangle } from "lucide-react";

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

// Animates open/close by interpolating the content height Radix exposes via
// --radix-collapsible-content-height. Callers that pass their own animate-*
// classes (e.g. ai-elements/tool.tsx) still win through cn/tailwind-merge.
const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ className, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={cn(
      "data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden",
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName =
  CollapsiblePrimitive.CollapsibleContent.displayName;

function CollapsibleTriggerTriangle({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <CollapsibleTrigger asChild>
      <Triangle
        className={cn(
          "fill-foreground",
          !open ? "rotate-90" : "rotate-180",
          className,
        )}
      />
    </CollapsibleTrigger>
  );
}

// A real <button> so the trigger is keyboard-focusable, with negative margins
// cancelling the padding to widen the hit area without shifting layout.
// `className` styles the chevron icon itself (sizing stays with the caller).
function CollapsibleTriggerChevron({
  open,
  className,
  label = "Toggle",
  triggerClassName,
}: {
  open: boolean;
  className?: string;
  label?: string;
  triggerClassName?: string;
}) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "-m-1 flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          triggerClassName,
        )}
      >
        <ChevronRight
          className={cn(
            "transition-transform duration-200 ease-out",
            !open ? "rotate-0" : "rotate-90",
            className,
          )}
        />
      </button>
    </CollapsibleTrigger>
  );
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleTriggerTriangle,
  CollapsibleTriggerChevron,
};
