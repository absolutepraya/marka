import { useEffect, useState } from "react";
import MarkdownEditor from "@/components/ui/markdown/markdown-editor";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import type { ZBookmarkTextFormat } from "@karakeep/shared/types/bookmarks";
import { useTranslation } from "@/lib/i18n/client";

function PlainTextEditor({
  initialText,
  isSaving,
  onSave,
}: {
  initialText: string;
  isSaving: boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const { t } = useTranslation();

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  return (
    <div className="flex h-full flex-col gap-3">
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-0 flex-1 resize-none font-mono"
        aria-label={t("editor.plain_text_content")}
      />
      <div className="flex justify-end">
        <Button onClick={() => onSave(text)} disabled={isSaving}>
          {isSaving ? t("actions.saving") : t("actions.save")}
        </Button>
      </div>
    </div>
  );
}

export function BookmarkMarkdownComponent({
  children: bookmark,
  readOnly = true,
}: {
  children: {
    id: string;
    content: {
      text: string;
      format?: ZBookmarkTextFormat;
    };
  };
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { mutate: updateBookmarkMutator, isPending } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: t("actions.note_updated"),
      });
    },
    onError: () => {
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  const onSave = (text: string) => {
    updateBookmarkMutator({
      bookmarkId: bookmark.id,
      text,
    });
  };

  const format = bookmark.content.format ?? "markdown";

  return (
    <div className="h-full">
      {readOnly ? (
        format === "plain" ? (
          <pre className="bookmark-markdown-preview-plain whitespace-pre-wrap break-words font-sans">
            {bookmark.content.text}
          </pre>
        ) : (
          <MarkdownReadonly
            className="bookmark-markdown-preview"
            onSave={onSave}
          >
            {bookmark.content.text}
          </MarkdownReadonly>
        )
      ) : format === "plain" ? (
        <PlainTextEditor
          initialText={bookmark.content.text}
          isSaving={isPending}
          onSave={onSave}
        />
      ) : (
        <MarkdownEditor onSave={onSave} isSaving={isPending}>
          {bookmark.content.text}
        </MarkdownEditor>
      )}
    </div>
  );
}
