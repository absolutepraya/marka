import React, { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookmarkListSelector } from "@/components/dashboard/lists/BookmarkListSelector";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { BOOKMARK_DRAG_MIME } from "@/lib/bookmark-drag";
import { parseCaptureUrls, useCaptureComposer } from "@/lib/capture-composer";
import type { PendingCapture } from "@/lib/capture-composer";
import { useClientConfig } from "@/lib/clientConfig";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { useTranslation } from "@/lib/i18n/client";
import { cn, getOS } from "@/lib/utils";
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Music2,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useHotkeys } from "react-hotkeys-hook";

import { useBookmarkGridContext } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import {
  getDropzoneAccept,
  getSupportedContentFormats,
} from "@karakeep/shared/content-support";

function supportedFile(file: File) {
  return getSupportedContentFormats("topLevel").some((format) => {
    const knownExtension = format.extensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    );
    return format.id === "markdown"
      ? knownExtension
      : format.mimeTypes.includes(file.type) || knownExtension;
  });
}

function CaptureThumbnail({ item }: { item: PendingCapture }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!item.file?.type.startsWith("image/") || !URL.createObjectURL) return;
    const objectUrl = URL.createObjectURL(item.file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.file]);
  const Icon = item.file?.type.startsWith("image/")
    ? ImageIcon
    : item.file?.type.startsWith("video/")
      ? Film
      : item.file?.type.startsWith("audio/")
        ? Music2
        : FileText;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/60">
      {url ? (
        // Local blob previews cannot be optimized by the server.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

function CaptureItem({
  item,
  busy,
  demoMode,
  offline,
  onRetry,
  onRemove,
}: {
  item: PendingCapture;
  busy: boolean;
  demoMode: boolean;
  offline: boolean;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        "flex min-w-0 flex-wrap items-start gap-2.5 rounded-xl border border-border/70 bg-background/60 p-2.5",
        item.status === "error" && "border-destructive/40",
      )}
    >
      <CaptureThumbnail item={item} />
      <div className="min-w-0 flex-1 basis-1/2">
        <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
          {item.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.status === "saving"
            ? t("editor.capture.saving_item")
            : item.file
              ? `${(item.file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
              : t("editor.capture.pending_text")}
        </p>
        {item.bookmarkId && item.status === "error" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("editor.capture.saved_placement_pending")}
          </p>
        )}
        {item.error && (
          <p
            role="alert"
            className="mt-1 break-words text-xs text-destructive [overflow-wrap:anywhere]"
          >
            {item.error}
          </p>
        )}
        {item.status === "error" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-events-auto mt-1 h-8 px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            disabled={
              busy ||
              demoMode ||
              (offline && !item.offlineCreated && item.input?.type !== "text")
            }
            onClick={onRetry}
          >
            {t("editor.capture.retry")}
          </Button>
        )}
      </div>
      {item.status === "saving" ? (
        <Loader2
          aria-hidden="true"
          className="mt-2 size-4 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="pointer-events-auto size-9 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={t("editor.capture.remove_item", {
            name: item.label,
          })}
          disabled={busy}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </li>
  );
}

export default function EditorCard({
  className,
  onCreated,
  emptyList = false,
}: {
  className?: string;
  onCreated?: () => void;
  emptyList?: boolean;
}) {
  const { t } = useTranslation();
  const composer = useCaptureComposer();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const listContext = useBookmarkListContext();
  const gridContext = useBookmarkGridContext();
  const demoMode = !!useClientConfig().demoMode;
  const [rejection, setRejection] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const headingId = useId();
  const helpId = useId();
  const clipboardErrorId = useId();
  const pendingItemsId = useId();
  const fileItems = composer.items.filter((item) => item.file);
  const textItems = composer.items.filter((item) => !item.file);
  const newestItems = [...fileItems].reverse();
  const visibleItems = showAllItems ? newestItems : newestItems.slice(0, 4);
  const hiddenItemCount = Math.max(0, fileItems.length - 4);
  const busy = composer.saving;
  const currentListId =
    listContext?.type === "manual"
      ? listContext.id
      : (pathname?.match(/^\/dashboard\/lists\/([^/]+)$/)?.[1] ?? null);
  useEffect(() => {
    composer.initializeDestination(currentListId);
  }, [currentListId]);
  useHotkeys("mod+e", () => inputRef.current?.focus());

  const stage = (files: File[]) => {
    if (busy || demoMode) return;
    if (composer.offline) {
      setRejection(t("editor.capture.connect_files"));
      return;
    }
    const rejected = files.filter((file) => !supportedFile(file));
    setRejection(
      rejected.length
        ? `${rejected.map((file) => file.name).join(", ")}: ${t("common.only_images_pdf_markdown_top_level")}`
        : null,
    );
    composer.stageFiles(files.filter(supportedFile));
  };
  const dropzone = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    disabled: busy || demoMode || composer.offline,
    accept: getDropzoneAccept("topLevel"),
    onDrop: (accepted, rejected) => {
      stage(accepted);
      if (rejected.length)
        setRejection(
          `${rejected.map(({ file }) => file.name).join(", ")}: ${t("common.only_images_pdf_markdown_top_level")}`,
        );
    },
  });
  const destination = {
    listId: composer.listId,
    tagId: gridContext?.tagId,
    archived: gridContext?.archived,
    favourited: gridContext?.favourited,
  };
  const save = async (id?: string) => {
    if (demoMode || busy) return;
    if (await composer.save(destination, id)) {
      setShowAllItems(false);
      onCreated?.();
    } else {
      // Failed items must remain reachable even if they were in the older batch.
      setShowAllItems(true);
    }
  };
  const insertText = (text: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? composer.text.length;
    const end = input?.selectionEnd ?? composer.text.length;
    composer.setText(
      composer.text.slice(0, start) + text + composer.text.slice(end),
    );
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const paste = async () => {
    setClipboardError(null);
    try {
      if (!navigator.clipboard?.readText)
        throw new Error(t("editor.capture.clipboard_unavailable"));
      const text = await navigator.clipboard.readText();
      if (!text) {
        setClipboardError(t("editor.capture.clipboard_empty"));
        return;
      }
      insertText(text);
    } catch {
      setClipboardError(t("editor.capture.clipboard_unavailable"));
    }
  };
  const urls = parseCaptureUrls(composer.text.trim());
  const count =
    (composer.text.trim() ? (urls?.length ?? 1) : 0) + composer.items.length;
  const canSave = composer.offline
    ? (!!composer.text.trim() && !urls) ||
      composer.items.some(
        (item) => item.input?.type === "text" || item.offlineCreated,
      )
    : count > 0;
  return (
    <form
      {...dropzone.getRootProps({
        onDragEnter: (event) => {
          if (event.dataTransfer.types.includes(BOOKMARK_DRAG_MIME))
            event.stopPropagation();
        },
        onDrop: (event) => {
          if (event.dataTransfer.types.includes(BOOKMARK_DRAG_MIME))
            event.stopPropagation();
        },
        role: "form",
      })}
      aria-labelledby={headingId}
      aria-busy={busy}
      data-capture-composer
      className={cn(
        "shadow-xs ease-(--ease-out) relative flex w-full min-w-0 max-w-full flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 transition-[border-color,box-shadow,background-color] duration-150",
        dropzone.isDragActive &&
          "border-primary bg-primary/5 ring-2 ring-primary/25",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        {...dropzone.getInputProps({
          "aria-label": t("editor.capture.choose_files"),
        })}
      />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p
          id={headingId}
          className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t("editor.new_item")}
        </p>
        {isMobile ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            disabled={busy || demoMode}
            onClick={() => void paste()}
          >
            <ClipboardPaste className="size-3.5" aria-hidden="true" />
            {t("editor.capture.paste")}
          </Button>
        ) : (
          <Kbd>{getOS() === "macos" ? "⌘" : "Ctrl"} + E</Kbd>
        )}
      </div>
      {emptyList && (
        <div
          className="flex items-start gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Bookmark className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium text-foreground">
              {t("editor.capture.empty_list_title")}
            </span>
            <br />
            {t("editor.capture.empty_list_hint")}
          </p>
        </div>
      )}
      <div className="flex min-h-36 min-w-0 flex-1 flex-col gap-3">
        <Textarea
          ref={inputRef}
          data-capture-input
          value={composer.text}
          disabled={busy || demoMode}
          aria-label={t("editor.capture.content_label")}
          aria-describedby={
            clipboardError ? `${helpId} ${clipboardErrorId}` : helpId
          }
          placeholder={t("editor.capture.placeholder")}
          className="min-h-36 min-w-0 max-w-full flex-1 resize-y rounded-xl border-0 bg-muted p-3 text-sm leading-relaxed shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-background"
          onChange={(event) => {
            composer.setText(event.target.value);
            setClipboardError(null);
          }}
          onPaste={(event) => {
            const clipboard = event.clipboardData;
            const files = Array.from(clipboard.files);
            if (!files.length)
              for (const item of Array.from(clipboard.items ?? [])) {
                if (item.kind !== "file") continue;
                const file = item.getAsFile();
                if (file) files.push(file);
              }
            if (files.length) {
              event.preventDefault();
              stage(files);
              const text = event.clipboardData.getData("text/plain");
              if (text) insertText(text);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              void save();
              return;
            }
            if (event.shiftKey) return;
            const start = event.currentTarget.selectionStart;
            const line = composer.text.slice(0, start).split("\n").at(-1);
            if (line?.startsWith("- [ ] ")) {
              event.preventDefault();
              insertText("\n- [ ] ");
            }
          }}
        />
        {clipboardError && (
          <p
            id={clipboardErrorId}
            role="alert"
            className="flex w-full min-w-0 items-start justify-center gap-1.5 text-center text-xs text-destructive [overflow-wrap:anywhere]"
          >
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0">{clipboardError}</span>
          </p>
        )}
      </div>
      <div className="relative flex min-w-0 flex-col gap-3 rounded-xl bg-background px-3 py-3 dark:bg-muted">
        <button
          type="button"
          className="absolute inset-0 size-full cursor-pointer rounded-xl bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
          onClick={dropzone.open}
          disabled={busy || demoMode || composer.offline}
          aria-label={t("editor.capture.choose_or_drop_files")}
          aria-describedby={helpId}
        />
        <svg
          className="pointer-events-none absolute inset-0 size-full text-ring"
          aria-hidden="true"
        >
          <rect
            x="0.5"
            y="0.5"
            style={{ width: "calc(100% - 1px)", height: "calc(100% - 1px)" }}
            rx="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
        </svg>
        <div
          className={cn(
            "pointer-events-none relative flex flex-col items-center justify-center gap-1.5 text-center",
            (busy || demoMode || composer.offline) && "opacity-50",
          )}
        >
          <span className="flex items-center justify-center gap-2 text-sm font-medium">
            <Paperclip className="size-4 shrink-0" aria-hidden="true" />
            {t("editor.capture.choose_or_drop_files")}
          </span>
          <span
            id={helpId}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {composer.offline
              ? t("editor.capture.connect_files")
              : t("editor.capture.formats_hint")}
          </span>
        </div>
        {fileItems.length > 0 && (
          <ul
            id={pendingItemsId}
            aria-label={t("editor.capture.pending_items")}
            className="pointer-events-none relative flex min-w-0 flex-col gap-2"
          >
            {visibleItems.map((item) => (
              <CaptureItem
                key={item.id}
                item={item}
                busy={busy}
                demoMode={demoMode}
                offline={composer.offline}
                onRetry={() => void save(item.id)}
                onRemove={() => {
                  composer.removeItem(item.id);
                  if (fileItems.length === 1) setShowAllItems(false);
                }}
              />
            ))}
          </ul>
        )}
        {hiddenItemCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative -mt-1 h-6 gap-1 self-center px-2 py-0 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-expanded={showAllItems}
            aria-controls={pendingItemsId}
            onClick={() => setShowAllItems((value) => !value)}
          >
            {showAllItems ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
            {showAllItems
              ? t("editor.capture.collapse_files")
              : hiddenItemCount === 1
                ? t("editor.capture.show_older_file")
                : t("editor.capture.show_older_files", {
                    count: hiddenItemCount,
                  })}
          </Button>
        )}
        {rejection && (
          <p
            role="alert"
            className="pointer-events-none relative flex w-full min-w-0 items-start justify-center gap-1.5 text-center text-xs text-destructive [overflow-wrap:anywhere]"
          >
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0">{rejection}</span>
          </p>
        )}
      </div>
      {textItems.length > 0 && (
        <ul
          aria-label={t("editor.capture.pending_text_items", {
            defaultValue: "Pending links and notes",
          })}
          className="flex min-w-0 flex-col gap-2"
        >
          {textItems.map((item) => (
            <CaptureItem
              key={item.id}
              item={item}
              busy={busy}
              demoMode={demoMode}
              offline={composer.offline}
              onRetry={() => void save(item.id)}
              onRemove={() => composer.removeItem(item.id)}
            />
          ))}
        </ul>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <BookmarkListSelector
          value={composer.listId}
          onChange={composer.setListId}
          listTypes={["manual"]}
          placeholder={t("actions.add_to_list")}
          disabled={busy || demoMode}
          className="min-w-0 flex-1"
        />
        {composer.listId && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={t("actions.clear", { defaultValue: "Clear" })}
            disabled={busy || demoMode}
            onClick={() => composer.setListId(null)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <ActionButton
        type="submit"
        loading={busy}
        disabled={!canSave}
        className="gap-2 active:scale-[0.97]"
      >
        {count > 1
          ? t("editor.capture.save_items", { count })
          : t("actions.save")}
        {!isMobile && count > 0 && (
          <span className="text-xs opacity-70">
            {getOS() === "macos" ? "⌘" : "Ctrl"} ↵
          </span>
        )}
      </ActionButton>
      <span role="status" className="sr-only">
        {busy
          ? t("editor.capture.saving_item")
          : t("editor.capture.item_count", { count: composer.items.length })}
      </span>
      {dropzone.isDragActive && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card/95 p-5 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">{t("editor.capture.drop_here")}</p>
          <p className="text-xs text-muted-foreground">
            {t("editor.capture.drop_hint")}
          </p>
        </div>
      )}
    </form>
  );
}
