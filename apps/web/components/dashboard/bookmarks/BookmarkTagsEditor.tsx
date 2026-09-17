import React from "react";

import { toast } from "@/components/ui/sonner";
import {
  isOfflineQueuedMutation,
  useOfflineSafeBookmarkTags,
} from "@/lib/hooks/useOfflineSafeBookmarkMutation";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { TagsEditor } from "./TagsEditor";

export function BookmarkTagsEditor({
  bookmark,
  disabled,
  className,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
  className?: string;
}) {
  const updateTags = useOfflineSafeBookmarkTags();

  const notifyTagSave = (result: unknown) => {
    toast({
      description: isOfflineQueuedMutation(result)
        ? "Saved offline, will sync when connected"
        : "Tags has been updated!",
    });
  };

  const notifyTagSaveError = (error: unknown) => {
    toast({
      variant: "destructive",
      title: "Something went wrong",
      description:
        error instanceof Error
          ? error.message
          : "There was a problem with your request.",
    });
  };

  return (
    <div>
      <TagsEditor
        tags={bookmark.tags}
        className={className}
        disabled={disabled}
        allowCreation
        onAttach={async ({ tagName, tagId }) => {
          try {
            const result = await updateTags.mutateAsync({
              bookmarkId: bookmark.id,
              attach: [{ tagName, tagId }],
              detach: [],
            });
            notifyTagSave(result);
          } catch (error) {
            notifyTagSaveError(error);
            throw error;
          }
        }}
        onDetach={async ({ tagId }) => {
          try {
            const result = await updateTags.mutateAsync({
              bookmarkId: bookmark.id,
              attach: [],
              detach: [{ tagId }],
            });
            notifyTagSave(result);
          } catch (error) {
            notifyTagSaveError(error);
            throw error;
          }
        }}
      />
    </div>
  );
}
