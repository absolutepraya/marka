"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const TEXT_ENTRY_INPUT_TYPES: Record<string, true> = {
  email: true,
  number: true,
  password: true,
  search: true,
  tel: true,
  text: true,
  url: true,
};

const FOCUSED_FIELD_CLEARANCE = 12;
const KEYBOARD_SETTLE_DELAY_MS = 350;

function isTextEntryControl(
  element: EventTarget | null,
): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement || element.isContentEditable) {
    return true;
  }

  return (
    element instanceof HTMLInputElement &&
    TEXT_ENTRY_INPUT_TYPES[element.type] === true
  );
}

function getFocusedControlRect(control: HTMLElement) {
  if (control.isContentEditable) {
    const selection = window.getSelection();
    if (
      selection?.rangeCount &&
      selection.anchorNode &&
      control.contains(selection.anchorNode)
    ) {
      const rects = selection.getRangeAt(0).getClientRects();
      const rect = rects.item(rects.length - 1);
      if (rect) return rect;
    }
  }

  return control.getBoundingClientRect();
}

function getLowerOcclusionBoundary(dialog: HTMLElement, control: HTMLElement) {
  const visualViewport = window.visualViewport;
  let boundary = visualViewport
    ? visualViewport.offsetTop + visualViewport.height
    : window.innerHeight;
  const dialogRect = dialog.getBoundingClientRect();

  for (const element of dialog.querySelectorAll<HTMLElement>("*")) {
    if (element === control || element.contains(control)) continue;
    if (
      !["fixed", "sticky"].includes(window.getComputedStyle(element).position)
    ) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (
      rect.top < dialogRect.top + dialogRect.height / 2 ||
      rect.top >= boundary ||
      rect.bottom <= dialogRect.top
    ) {
      continue;
    }

    boundary = rect.top;
  }

  return boundary - FOCUSED_FIELD_CLEARANCE;
}

function getScrollableAncestors(control: HTMLElement, dialog: HTMLElement) {
  const containers: HTMLElement[] = [];
  let ancestor = control.parentElement;

  while (ancestor) {
    const overflowY = window.getComputedStyle(ancestor).overflowY;
    if (
      ["auto", "scroll", "overlay"].includes(overflowY) &&
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      containers.push(ancestor);
    }
    if (ancestor === dialog) break;
    ancestor = ancestor.parentElement;
  }

  return containers;
}

export function revealFocusedTextEntry(
  dialog: HTMLElement,
  control: HTMLElement,
) {
  if (!dialog.contains(control)) return;

  const visualViewport = window.visualViewport;
  const topBoundary =
    (visualViewport?.offsetTop ?? 0) + FOCUSED_FIELD_CLEARANCE;

  for (const container of getScrollableAncestors(control, dialog)) {
    const controlRect = getFocusedControlRect(control);
    const bottomBoundary = getLowerOcclusionBoundary(dialog, control);
    const offset =
      controlRect.bottom > bottomBoundary
        ? controlRect.bottom - bottomBoundary
        : controlRect.top < topBoundary
          ? controlRect.top - topBoundary
          : 0;

    if (!offset) return;

    const availableScroll =
      offset > 0
        ? container.scrollHeight - container.clientHeight - container.scrollTop
        : -container.scrollTop;
    const scrollAmount =
      offset > 0
        ? Math.min(offset, Math.max(availableScroll, 0))
        : Math.max(offset, availableScroll);

    if (!scrollAmount) return;
    container.scrollTop += scrollAmount;
    if (Math.abs(scrollAmount) === Math.abs(offset)) return;
  }
}

function setForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function useFocusedFieldReveal(dialog: HTMLElement | null) {
  const [activeControl, setActiveControl] = React.useState<HTMLElement | null>(
    null,
  );
  const firstFrame = React.useRef<number | null>(null);
  const secondFrame = React.useRef<number | null>(null);
  const keyboardSettleTimer = React.useRef<number | null>(null);

  const scheduleReveal = React.useCallback(
    (control: HTMLElement, recheckAfterKeyboardSettles = false) => {
      if (!dialog) return;

      if (firstFrame.current !== null) {
        window.cancelAnimationFrame(firstFrame.current);
      }
      if (secondFrame.current !== null) {
        window.cancelAnimationFrame(secondFrame.current);
      }
      firstFrame.current = window.requestAnimationFrame(() => {
        secondFrame.current = window.requestAnimationFrame(() => {
          if (document.activeElement === control) {
            revealFocusedTextEntry(dialog, control);
          }
        });
      });

      if (recheckAfterKeyboardSettles) {
        if (keyboardSettleTimer.current !== null) {
          window.clearTimeout(keyboardSettleTimer.current);
        }
        keyboardSettleTimer.current = window.setTimeout(() => {
          keyboardSettleTimer.current = null;
          if (document.activeElement === control) {
            revealFocusedTextEntry(dialog, control);
          }
        }, KEYBOARD_SETTLE_DELAY_MS);
      }
    },
    [dialog],
  );

  React.useEffect(() => {
    if (!dialog) return;

    const control = document.activeElement;
    if (isTextEntryControl(control) && dialog.contains(control)) {
      setActiveControl(control);
      scheduleReveal(control, true);
    }
  }, [dialog, scheduleReveal]);

  React.useEffect(() => {
    if (!dialog || !activeControl) return;

    const visualViewport = window.visualViewport;
    const onViewportChange = () => scheduleReveal(activeControl);
    visualViewport?.addEventListener("resize", onViewportChange);
    visualViewport?.addEventListener("scroll", onViewportChange);

    const resizeObserver = new ResizeObserver(() =>
      scheduleReveal(activeControl),
    );
    resizeObserver.observe(activeControl);

    return () => {
      visualViewport?.removeEventListener("resize", onViewportChange);
      visualViewport?.removeEventListener("scroll", onViewportChange);
      resizeObserver.disconnect();
    };
  }, [activeControl, dialog, scheduleReveal]);

  React.useEffect(
    () => () => {
      if (firstFrame.current !== null) {
        window.cancelAnimationFrame(firstFrame.current);
      }
      if (secondFrame.current !== null) {
        window.cancelAnimationFrame(secondFrame.current);
      }
      if (keyboardSettleTimer.current !== null) {
        window.clearTimeout(keyboardSettleTimer.current);
      }
    },
    [],
  );

  return {
    onFocusCapture(event: React.FocusEvent<HTMLElement>) {
      if (!isTextEntryControl(event.target)) return;
      setActiveControl(event.target);
      scheduleReveal(event.target, true);
    },
  };
}

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "ease-(--ease-out) fixed inset-0 z-50 bg-black/80 duration-200 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseBtn?: boolean;
    position?: "center" | "bottom";
  }
>(
  (
    {
      className,
      children,
      hideCloseBtn = false,
      position = "center",
      onFocusCapture,
      ...props
    },
    ref,
  ) => {
    const [dialog, setDialog] = React.useState<HTMLElement | null>(null);
    const focusedFieldReveal = useFocusedFieldReveal(dialog);
    const setDialogRef = React.useCallback(
      (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
        setDialog(node);
        setForwardedRef(ref, node);
      },
      [ref],
    );

    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={setDialogRef}
          className={cn(
            position === "bottom"
              ? "dialog-vv-bottom dialog-vv-bottom-safe-area"
              : "dialog-vv-center",
            "ease-(--ease-out) fixed left-[50%] z-50 grid w-full min-w-0 max-w-lg origin-center translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto border border-border/80 bg-popover p-6 shadow-[var(--elevation-overlay)] duration-200 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl",
            className,
          )}
          {...props}
          onFocusCapture={(event) => {
            onFocusCapture?.(event);
            focusedFieldReveal.onFocusCapture(event);
          }}
        >
          {children}
          {!hideCloseBtn && (
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

const ResponsiveDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseBtn?: boolean;
  }
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    position="bottom"
    className={cn(
      "dialog-vv-bottom left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-[1.75rem] border-x-0 border-b-0 bg-card p-5 shadow-2xl sm:bottom-auto sm:left-[50%] sm:top-[calc(var(--vvo)+var(--vvh)/2)] sm:max-h-[calc(var(--vvh)-2rem)] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border sm:p-6",
      className,
    )}
    {...props}
  />
));
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

type DialogFooterProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Render the direct action slots in equal-width columns, usually two. */
  equalColumns?: number;
};

const DialogFooter = ({
  className,
  equalColumns,
  style,
  ...props
}: DialogFooterProps) => {
  const columnCount =
    typeof equalColumns === "number" && Number.isFinite(equalColumns)
      ? Math.max(1, Math.trunc(equalColumns))
      : undefined;

  return (
    <div
      className={cn(
        columnCount
          ? "grid min-w-0 gap-2 [&>*]:w-full [&>*]:min-w-0 [&_button]:h-full [&_button]:min-h-11 [&_button]:w-full [&_button]:whitespace-normal [&_button]:[overflow-wrap:anywhere]"
          : "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      style={
        columnCount
          ? {
              ...style,
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            }
          : style
      }
      {...props}
    />
  );
};
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  ResponsiveDialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
