import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

// The shared gap owns spacing; normalize the common legacy direct-icon
// margins so existing call sites do not double their icon-to-label spacing.
const buttonVariants = cva(
  "ease-(--ease-out) relative isolate inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 enabled:active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 motion-reduce:transition-none motion-reduce:enabled:active:translate-y-0 [&>svg.ml-2]:ml-0 [&>svg.mr-2]:mr-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        none: "",
        default:
          "border border-black/10 bg-primary text-primary-foreground shadow-[var(--elevation-control,0_1px_2px_rgb(0_0_0/0.1))] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[inset_0_1px_0_rgb(255_255_255/0.24)] hover:bg-primary/90 active:shadow-none active:before:shadow-none",
        destructive:
          "border border-black/10 bg-destructive text-destructive-foreground shadow-sm before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:bg-destructive/90 active:shadow-none",
        destructiveOutline:
          "border border-destructive bg-transparent text-destructive hover:bg-destructive/90 hover:text-destructive-foreground",
        outline:
          "border border-input bg-card text-foreground shadow-[var(--elevation-control,0_1px_2px_rgb(0_0_0/0.05))] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[var(--control-highlight,inset_0_1px_0_rgb(255_255_255/0.8))] hover:bg-accent hover:text-accent-foreground active:shadow-none active:before:shadow-none",
        secondary:
          "border border-border bg-secondary text-secondary-foreground shadow-[var(--elevation-control,0_1px_2px_rgb(0_0_0/0.05))] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[var(--control-highlight,inset_0_1px_0_rgb(255_255_255/0.8))] hover:bg-accent active:shadow-none active:before:shadow-none",
        ghost:
          "border border-transparent hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent data-[state=open]:bg-accent",
        ghostDestructive:
          "border border-transparent text-destructive hover:bg-destructive/10 hover:text-destructive",
        border: "border border-input hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        none: "",
        default: "h-10 px-3.5 py-2",
        sm: "h-8 px-2.5",
        lg: "h-11 rounded-md px-8",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-xs": "size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
