import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";

import { ZBookmark, ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";

export function BookmarkedTextEditor({
  bookmark,
  open,
  setOpen,
  canEditContent,
  textVersion,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
  canEditContent: boolean;
  textVersion?: number;
}) {
  const isNewBookmark = bookmark === undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogContent className="sm:max-w-[80%]">
        <DialogHeader className="flex">
          <DialogTitle className="w-fit">
            {isNewBookmark ? "New Note" : "Edit Note"}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[80vh]">
          <BookmarkMarkdownComponent
            readOnly={false}
            canEditContent={canEditContent}
            textVersion={textVersion}
            onUseServer={() => setOpen(false)}
          >
            {bookmark as ZBookmarkTypeText}
          </BookmarkMarkdownComponent>
        </div>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
