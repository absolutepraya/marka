"use client";

import React from "react";
import { cn } from "@/lib/utils";

import { ActionButtonWithTooltip } from "./action-button";
import type { ActionButtonProps } from "./action-button";

export const EditingButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ActionButtonProps, "loading"> & { tooltip: string; loading?: boolean }
>(function EditingButton(
  { className, loading = false, variant = "ghost", ...props },
  ref,
) {
  return (
    <ActionButtonWithTooltip
      ref={ref}
      variant={variant}
      size="sm"
      loading={loading}
      delayDuration={100}
      aria-label={props.tooltip}
      className={cn(
        "h-8 min-w-8 shrink-0 gap-1.5 px-2 sm:h-9 sm:min-w-9 sm:px-2.5 [&_svg]:size-4 sm:[&_svg]:size-[18px]",
        className,
      )}
      {...props}
    />
  );
});
