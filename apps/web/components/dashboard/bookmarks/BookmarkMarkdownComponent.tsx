import { useEffect, useState } from "react";
import MarkdownEditor from "@/components/ui/markdown/markdown-editor";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import type { ZBookmarkTextFormat } from "@karakeep/shared/types/bookmarks";
import { useTranslation } from "@/lib/i18n/client";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { BookmarkContentConflictDialog } from "./BookmarkContentConflictDialog";

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
  canEditContent = false,
  textVersion,
  onUseServer,
}: {
  children: {
    id: string;
    content: {
      text: string;
      format?: ZBookmarkTextFormat;
    };
  };
  readOnly?: boolean;
  canEditContent?: boolean;
  textVersion?: number;
  onUseServer?: () => void;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: updateBookmark, isPending } = useUpdateBookmark();
  const [baseVersion, setBaseVersion] = useState(textVersion);
  const [conflict, setConflict] = useState<{
    draft: string;
    serverText: string;
    serverVersion: number;
  } | null>(null);

  useEffect(() => {
    setBaseVersion(textVersion);
  }, [textVersion]);

  const isConflictError = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "CONFLICT";

  const onSave = async (
    text: string,
    version = baseVersion,
  ): Promise<boolean> => {
    if (!canEditContent) return false;
    try {
      await updateBookmark({
        bookmarkId: bookmark.id,
        text,
        ...(version === undefined ? {} : { textBaseVersion: version }),
      });
      setBaseVersion((current) =>
        version === undefined ? current : version + 1,
      );
      toast({
        description: t("actions.note_updated"),
      });
      return true;
    } catch (error) {
      if (isConflictError(error)) {
        try {
          const [serverBookmark, permissions] = await Promise.all([
            queryClient.fetchQuery(
              api.bookmarks.getBookmark.queryOptions({
                bookmarkId: bookmark.id,
                includeContent: false,
              }),
            ),
            queryClient.fetchQuery(
              api.bookmarks.getContentPermissions.queryOptions({
                bookmarkId: bookmark.id,
              }),
            ),
          ]);
          setConflict({
            draft: text,
            serverText:
              serverBookmark.content.type === "text"
                ? serverBookmark.content.text
                : "",
            serverVersion: permissions.textVersion,
          });
        } catch {
          toast({
            description: t("common.something_went_wrong"),
            variant: "destructive",
          });
        }
        return false;
      }
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
      return false;
    }
  };

  const format = bookmark.content.format ?? "markdown";

  return (
    <>
      <div className="h-full">
        {readOnly || !canEditContent ? (
          format === "plain" ? (
            <pre className="bookmark-markdown-preview-plain whitespace-pre-wrap break-words font-sans">
              {bookmark.content.text}
            </pre>
          ) : (
            <MarkdownReadonly
              className="bookmark-markdown-preview"
              onSave={canEditContent ? (text) => void onSave(text) : undefined}
              allowTodoToggle={canEditContent}
            >
              {bookmark.content.text}
            </MarkdownReadonly>
          )
        ) : format === "plain" ? (
          <PlainTextEditor
            initialText={bookmark.content.text}
            isSaving={isPending}
            onSave={(text) => void onSave(text)}
          />
        ) : (
          <MarkdownEditor
            onSave={(text) => void onSave(text)}
            isSaving={isPending}
          >
            {bookmark.content.text}
          </MarkdownEditor>
        )}
      </div>
      <BookmarkContentConflictDialog
        draft={conflict?.draft ?? null}
        serverText={conflict?.serverText ?? null}
        isSaving={isPending}
        onUseServer={() => {
          setConflict(null);
          onUseServer?.();
        }}
        onKeepDraft={() => {
          if (conflict) {
            setBaseVersion(conflict.serverVersion);
            void onSave(conflict.draft, conflict.serverVersion).then(
              (saved) => {
                if (saved) {
                  setConflict(null);
                }
              },
            );
          }
        }}
      />
    </>
  );
}
