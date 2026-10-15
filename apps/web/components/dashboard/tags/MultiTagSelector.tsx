import React from "react";
import useBulkTagActionsStore from "@/lib/bulkTagActions";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const MultiTagSelector = React.memo(function MultiTagSelector({
  id,
  name,
  count,
}: {
  id: string;
  name: string;
  count: number;
}) {
  const toggleTag = useBulkTagActionsStore((state) => state.toggleTag);
  const isSelected = useBulkTagActionsStore((state) => state.isTagSelected(id));

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={cn(
        "relative flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors",
        isSelected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
      data-id={id}
      onClick={() => toggleTag(id)}
    >
      <span className="truncate">{name}</span>
      <span aria-hidden="true" className="border-current/30 h-3 border-l" />
      <span>{count}</span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full border",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground bg-background",
        )}
      >
        {isSelected && <Check className="size-2" strokeWidth={3} />}
      </span>
    </button>
  );
});
