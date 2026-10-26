import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import bones from "@/components/loading-ui/bones/bookmark-tags.bones.json";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

export default function TagList({
  bookmark,
  loading,
  className,
}: {
  bookmark: ZBookmark;
  loading?: boolean;
  className?: string;
}) {
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

  if (loading) {
    return (
      <CapturedSkeleton
        name="bookmark-tags"
        bones={bones}
        className="w-full"
        fallback={<Skeleton className="h-12 w-full" />}
      />
    );
  }
  return (
    <>
      {bookmark.tags.map((tag) => (
        <BookmarkTag
          key={tag.id}
          id={tag.id}
          name={tag.name}
          isOwner={isOwner}
          className={className}
        />
      ))}
    </>
  );
}

export function BookmarkTag({
  id,
  name,
  isOwner,
  className,
}: {
  id: string;
  name: string;
  isOwner: boolean;
  className?: string;
}) {
  const tagClass = cn(
    badgeVariants({ variant: "secondary" }),
    "text-nowrap",
    isOwner && "hover:bg-foreground hover:text-secondary",
  );
  return (
    <div className={className}>
      {isOwner ? (
        <Link className={tagClass} href={`/dashboard/tags/${id}`}>
          {name}
        </Link>
      ) : (
        <span className={tagClass}>{name}</span>
      )}
    </div>
  );
}
