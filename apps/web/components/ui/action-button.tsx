import React from "react";
import { useClientConfig } from "@/lib/clientConfig";

import type { ButtonProps } from "./button";
import { Button } from "./button";
import LoadingSpinner from "./spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "./tooltip";

interface ActionButtonProps extends ButtonProps {
  loading: boolean;
  spinner?: React.ReactNode;
  ignoreDemoMode?: boolean;
}

function preventActivation(event: React.SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function guardActivationKey<T extends HTMLElement>(
  event: React.KeyboardEvent<T>,
  handler?: React.KeyboardEventHandler<T>,
) {
  if (event.key === "Enter" || event.key === " ") {
    preventActivation(event);
  } else {
    handler?.(event);
  }
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { children, loading, spinner, disabled, ignoreDemoMode = false, ...props },
    ref,
  ) => {
    const clientConfig = useClientConfig();
    spinner ||= <LoadingSpinner />;
    if (!ignoreDemoMode && clientConfig.demoMode) {
      disabled = true;
    } else if (disabled !== undefined) {
      disabled ||= loading;
    } else if (loading) {
      disabled = true;
    }

    const disabledSlot = props.asChild && disabled;
    // Slot composes child handlers before parent handlers. Guard both capture
    // handlers so neither the child's nor the parent's action can run first.
    const slottedChild =
      disabledSlot &&
      React.isValidElement<React.HTMLAttributes<HTMLElement>>(children)
        ? React.cloneElement(children, {
            "aria-disabled": true,
            tabIndex: -1,
            onClickCapture: preventActivation,
            onAuxClickCapture: preventActivation,
            onKeyDownCapture: (event) =>
              guardActivationKey(event, children.props.onKeyDownCapture),
          })
        : children;

    return (
      <Button
        ref={ref}
        {...props}
        aria-busy={loading}
        disabled={disabled}
        aria-disabled={disabledSlot ? true : props["aria-disabled"]}
        tabIndex={disabledSlot ? -1 : props.tabIndex}
        onClickCapture={disabledSlot ? preventActivation : props.onClickCapture}
        onAuxClickCapture={
          disabledSlot ? preventActivation : props.onAuxClickCapture
        }
        onKeyDownCapture={
          disabledSlot
            ? (event) => guardActivationKey(event, props.onKeyDownCapture)
            : props.onKeyDownCapture
        }
      >
        {props.asChild ? (
          slottedChild
        ) : (
          <>
            <span
              className={
                loading
                  ? "inline-flex items-center gap-2 opacity-0"
                  : "contents"
              }
            >
              {children}
            </span>
            {loading && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                {spinner}
              </span>
            )}
          </>
        )}
      </Button>
    );
  },
);
ActionButton.displayName = "ActionButton";

const ActionButtonWithTooltip = React.forwardRef<
  HTMLButtonElement,
  ActionButtonProps & { tooltip: string; delayDuration?: number }
>(({ tooltip, delayDuration, ...props }, ref) => {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>
        <ActionButton ref={ref} aria-label={tooltip} {...props} />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{tooltip}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
});
ActionButtonWithTooltip.displayName = "ActionButtonWithTooltip";

export { ActionButton, ActionButtonWithTooltip };
export type { ActionButtonProps };
