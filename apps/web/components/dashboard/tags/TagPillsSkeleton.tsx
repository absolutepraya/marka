import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import bones from "@/components/loading-ui/bones/tags.bones.json";

export function TagPillsSkeleton({ className }: { className?: string }) {
  return (
    <CapturedSkeleton
      name="tags"
      bones={bones}
      className={className}
      fallback={<Skeleton className="h-20 w-full" />}
    />
  );
}
