import React, { useRef } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { useDragAndDrop } from "@/lib/drag-and-drop";
import { cn } from "@/lib/utils";
import Draggable from "react-draggable";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";

export const TagPill = React.memo(function TagPill({
  id,
  name,
  count,
  isDraggable,
}: {
  id: string;
  name: string;
  count: number;
  isDraggable: boolean;
}) {
  const draggableRef = useRef<HTMLDivElement>(null);

  const { mutate: mergeTag } = useMergeTag({
    onSuccess: () => {
      toast({
        description: "Tags have been merged!",
      });
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Something went wrong",
        });
      }
    },
  });

  const dragAndDropFunction = useDragAndDrop(
    "data-id",
    (dragTargetId: string) => {
      mergeTag({
        fromTagIds: [id],
        intoTagId: dragTargetId,
      });
    },
  );

  const pill = (
    <TagPillContent id={id} name={name} count={count} ref={draggableRef} />
  );
  if (!isDraggable) {
    return pill;
  }
  return (
    <Draggable
      key={id}
      axis="both"
      onStart={dragAndDropFunction.handleDragStart}
      onStop={dragAndDropFunction.handleDragEnd}
      disabled={!isDraggable}
      defaultClassNameDragging={"position-relative z-10 pointer-events-none"}
      position={{ x: 0, y: 0 }}
      nodeRef={draggableRef}
    >
      {pill}
    </Draggable>
  );
});

export const TagPillContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    id: string;
    name: string;
    count: number;
  }
>(function TagPillContent({ id, name, count, className, ...props }, ref) {
  return (
    <div
      {...props}
      className={cn(
        "relative flex max-w-full items-center rounded-md border border-border bg-background text-xs text-foreground transition-colors hover:bg-foreground hover:text-background",
        className,
      )}
      ref={ref}
    >
      <Link
        className="flex min-w-0 items-center gap-1.5 px-2 py-0.5"
        href={`/dashboard/tags/${id}`}
        data-id={id}
        draggable={false}
        prefetch={false}
      >
        <span className="truncate">{name}</span>
        <span aria-hidden="true" className="border-current/30 h-3 border-l" />
        <span>{count}</span>
      </Link>
    </div>
  );
});
