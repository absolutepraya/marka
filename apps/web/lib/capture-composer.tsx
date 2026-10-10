"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "@/lib/auth/client";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import { useOfflineLibrary } from "@/lib/offline-library/provider";
import {
  useCreateBookmark,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useDeleteUnattachedAsset } from "@karakeep/shared-react/hooks/assets";
import { useAddBookmarkToList } from "@karakeep/shared-react/hooks/lists";
import {
  getBookmarkAssetTypeForMimeType,
  getTextDocumentFormat,
  getTextDocumentTitle,
  isTextDocumentFile,
  readTextDocument,
  TextDocumentDecodingError,
} from "@karakeep/shared/content-support";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { ZNewBookmarkRequest } from "@karakeep/shared/types/bookmarks";

export interface CaptureDestination {
  listId: string | null;
  tagId?: string;
  archived?: boolean;
  favourited?: boolean;
}

export interface PendingCapture {
  id: string;
  file?: File;
  input?: ZNewBookmarkRequest;
  label: string;
  status: "ready" | "saving" | "error";
  error?: string;
  bookmarkId?: string;
  destination?: CaptureDestination;
  offlineCreated?: boolean;
  listSaved?: boolean;
  tagSaved?: boolean;
}

interface CaptureDraft {
  text: string;
  items: PendingCapture[];
  listId: string | null;
  destinationInitialized: boolean;
  saving: boolean;
}

/** A textarea made entirely of URLs creates one link per non-empty line. */
export function parseCaptureUrls(text: string): string[] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  try {
    return lines.every((line) =>
      ["http:", "https:"].includes(new URL(line).protocol),
    )
      ? lines
      : null;
  } catch {
    return null;
  }
}

function useCaptureState() {
  const { t } = useTranslation();
  const { status, queueBookmarkCreate, queueBookmarkListMembership } =
    useOfflineLibrary();
  const { mutateAsync: createBookmark } = useCreateBookmark();
  const { mutateAsync: updateTags } = useUpdateBookmarkTags();
  const { mutateAsync: addToList } = useAddBookmarkToList();
  const { mutateAsync: deleteAsset } = useDeleteUnattachedAsset();
  const { mutateAsync: upload } = useUpload({});
  const [online, setOnline] = useState(true);
  const [draft, setDraft] = useState<CaptureDraft>({
    text: "",
    items: [],
    listId: null,
    destinationInitialized: false,
    saving: false,
  });
  const draftRef = useRef(draft);
  const change = (update: (value: CaptureDraft) => CaptureDraft) => {
    draftRef.current = update(draftRef.current);
    setDraft(draftRef.current);
  };
  const offline = status.kind === "offline" || !online;
  const offlineRef = useRef(offline);

  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const ignoreOutsideDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    document.addEventListener("dragover", ignoreOutsideDrop);
    document.addEventListener("drop", ignoreOutsideDrop);
    return () => {
      document.removeEventListener("dragover", ignoreOutsideDrop);
      document.removeEventListener("drop", ignoreOutsideDrop);
    };
  }, []);

  // The provider remains mounted when a dialog or route changes. Only leaving
  // the document destroys the draft, so ordinary internal navigation is safe.
  useEffect(() => {
    if (!draft.text.trim() && !draft.items.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.text, draft.items.length]);

  const updateItem = (id: string, fields: Partial<PendingCapture>) =>
    change((value) => ({
      ...value,
      items: value.items.map((item) =>
        item.id === id ? { ...item, ...fields } : item,
      ),
    }));

  const save = async (destination: CaptureDestination, onlyId?: string) => {
    if (draftRef.current.saving) return false;
    const text = onlyId ? "" : draftRef.current.text.trim();
    const urls = parseCaptureUrls(text);
    const newItems: PendingCapture[] = text
      ? (urls ?? [text]).map((value) => ({
          id: crypto.randomUUID(),
          label: value,
          input: urls
            ? { type: BookmarkTypes.LINK, url: value, source: "web" }
            : { type: BookmarkTypes.TEXT, text: value, source: "web" },
          status: "ready",
        }))
      : [];
    const items = [...draftRef.current.items, ...newItems].filter(
      (item) => !onlyId || item.id === onlyId,
    );
    // Notes can save offline even when previously staged files are waiting.
    const isEligible = (item: PendingCapture) =>
      !offlineRef.current ||
      item.input?.type === BookmarkTypes.TEXT ||
      item.offlineCreated;
    const eligible = items.filter(isEligible);
    const eligibleNewItems = newItems.filter(isEligible);
    if (!eligible.length) return false;
    change((value) => ({
      ...value,
      text: eligibleNewItems.length ? "" : value.text,
      items: [...value.items, ...eligibleNewItems],
      saving: true,
    }));
    let allSucceeded = true;
    try {
      for (const item of eligible) {
        const target = item.destination ?? { ...destination };
        updateItem(item.id, {
          status: "saving",
          error: undefined,
          destination: target,
        });
        let bookmarkId = item.bookmarkId;
        let offlineCreated = item.offlineCreated;
        try {
          if (!bookmarkId) {
            if (offlineRef.current && item.input?.type !== BookmarkTypes.TEXT)
              throw new Error(t("editor.capture.connect_files"));
            let input = item.input;
            let uploadedAssetId: string | undefined;
            if (item.file) {
              const file = item.file;
              const { name: fileName, type: fileType } = file;
              if (isTextDocumentFile(fileName, fileType)) {
                input = {
                  type: BookmarkTypes.TEXT,
                  text: await readTextDocument(file),
                  title: getTextDocumentTitle(fileName),
                  format: getTextDocumentFormat(fileName, fileType),
                  source: "web",
                };
              } else {
                const response = await upload(file);
                uploadedAssetId = response.assetId;
                const assetType = getBookmarkAssetTypeForMimeType(
                  response.contentType,
                );
                if (!assetType) {
                  await deleteAsset({ assetId: response.assetId });
                  throw new Error(
                    t("common.only_images_pdf_markdown_top_level"),
                  );
                }
                input = {
                  ...response,
                  type: BookmarkTypes.ASSET,
                  assetType,
                  source: "web",
                };
              }
            }
            if (!input) throw new Error(t("common.something_went_wrong"));
            try {
              if (
                offlineRef.current &&
                !item.file &&
                input.type === BookmarkTypes.TEXT
              ) {
                bookmarkId = crypto.randomUUID();
                await queueBookmarkCreate({
                  idempotencyKey: crypto.randomUUID(),
                  kind: "bookmark.create",
                  bookmarkId,
                  bookmark: {
                    ...input,
                    archived: target.archived,
                    favourited: target.favourited,
                    createdAt: new Date(),
                  },
                });
                offlineCreated = true;
              } else {
                const result = await createBookmark({
                  ...input,
                  archived: target.archived,
                  favourited: target.favourited,
                });
                bookmarkId = result.id;
              }
            } catch (error) {
              if (uploadedAssetId)
                await deleteAsset({ assetId: uploadedAssetId }).catch(
                  () => undefined,
                );
              throw error;
            }
            updateItem(item.id, { bookmarkId, offlineCreated });
          }
          if (target.listId && !item.listSaved) {
            if (offlineCreated) {
              await queueBookmarkListMembership({
                idempotencyKey: crypto.randomUUID(),
                kind: "bookmark.listMembership",
                bookmarkId,
                listId: target.listId,
                action: "add",
              });
            } else {
              await addToList({ bookmarkId, listId: target.listId });
            }
            updateItem(item.id, { listSaved: true });
          }
          if (target.tagId && !item.tagSaved) {
            if (offlineCreated && offlineRef.current)
              throw new Error(t("editor.capture.connect_tag"));
            await updateTags({
              bookmarkId,
              attach: [{ tagId: target.tagId }],
              detach: [],
            });
            updateItem(item.id, { tagSaved: true });
          }
          change((value) => ({
            ...value,
            items: value.items.filter((entry) => entry.id !== item.id),
          }));
        } catch (error) {
          allSucceeded = false;
          updateItem(item.id, {
            status: "error",
            error:
              error instanceof TextDocumentDecodingError
                ? t("editor.capture.invalid_utf8")
                : error instanceof Error
                  ? error.message
                  : t("common.something_went_wrong"),
          });
        }
      }
    } finally {
      change((value) => ({ ...value, saving: false }));
    }
    return (
      allSucceeded &&
      !draftRef.current.items.length &&
      !draftRef.current.text.trim()
    );
  };

  return {
    ...draft,
    offline,
    save,
    setText: (text: string) =>
      change((value) => (value.saving ? value : { ...value, text })),
    setListId: (listId: string | null) =>
      change((value) =>
        value.saving
          ? value
          : { ...value, listId, destinationInitialized: true },
      ),
    initializeDestination: (listId: string | null) =>
      change((value) =>
        value.destinationInitialized &&
        (value.text.trim() || value.items.length || value.saving)
          ? value
          : { ...value, listId, destinationInitialized: true },
      ),
    stageFiles: (files: File[]) =>
      change((value) =>
        value.saving || offlineRef.current
          ? value
          : {
              ...value,
              items: [
                ...value.items,
                ...files.map(
                  (file): PendingCapture => ({
                    id: crypto.randomUUID(),
                    file,
                    label: file.name,
                    status: "ready",
                  }),
                ),
              ],
            },
      ),
    removeItem: (id: string) =>
      change((value) =>
        value.saving
          ? value
          : { ...value, items: value.items.filter((item) => item.id !== id) },
      ),
  };
}

const CaptureContext = createContext<ReturnType<typeof useCaptureState> | null>(
  null,
);

function CaptureSession({ children }: { children: React.ReactNode }) {
  const value = useCaptureState();
  return (
    <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>
  );
}

export function CaptureComposerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  return (
    <CaptureSession key={session?.user.id ?? "anonymous"}>
      {children}
    </CaptureSession>
  );
}

export function useCaptureComposer() {
  const value = useContext(CaptureContext);
  if (!value)
    throw new Error("Capture composer requires CaptureComposerProvider");
  return value;
}
