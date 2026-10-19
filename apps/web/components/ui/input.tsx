import * as React from "react";
import { fieldStyles } from "@karakeep/shared-react/components/ui/control-styles";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, startIcon, endIcon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {startIcon && (
          <div className="absolute left-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center [&>*]:shrink-0">
            {startIcon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            fieldStyles,
            "flex h-10 w-full px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium sm:h-9",
            startIcon ? "pl-8" : "",
            endIcon ? "pr-8" : "",
            className,
          )}
          ref={ref}
          {...props}
        />
        {endIcon && (
          <div className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center [&>*]:shrink-0">
            {endIcon}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
