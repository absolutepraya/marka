"use client";

import { useCallback, useState } from "react";

import type {
  ZBookmark,
  ZUpdateBookmarksRequest,
} from "@karakeep/shared/types/bookmarks";
import type { ZOfflineSyncMutation } from "@karakeep/shared/types/offlineSync";
import {
  useUpdateBookmark,
  useUpdateBookmarkTags,
  useDeleteBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import {
  useAddBookmarkToList,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { normalizeTagName } from "@karakeep/shared/utils/tag";

import { useOfflineLibrary } from "@/lib/offline-library/provider";
import {
  getBookmarkFieldVersion,
  offlineLibraryDb,
} from "@/lib/offline-library/repository";

const OFFLINE_UPDATE_FIELDS = [
  "title",
  "archived",
  "favourited",
  "note",
  "summary",
  "url",
  "description",
  "author",
  "publisher",
  "text",
] as const;

type OfflineUpdateField = (typeof OFFLINE_UPDATE_FIELDS)[number];

const OFFLINE_UPDATE_FIELD_SET: Record<OfflineUpdateField, true> = {
  title: true,
  archived: true,
  favourited: true,
  note: true,
  summary: true,
  url: true,
  description: true,
  author: true,
  publisher: true,
  text: true,
};
type OfflineUpdateFields = Extract<
  ZOfflineSyncMutation,
  { kind: "bookmark.update" }
>["fields"];
interface BookmarkTagInput {
  tagId?: string;
  tagName?: string;
  attachedBy?: "human" | "ai";
}

export interface OfflineSafeBookmarkTagsInput {
  bookmarkId: string;
  attach: BookmarkTagInput[];
  detach: BookmarkTagInput[];
}

export interface OfflineSafeBookmarkListMembershipInput {
  bookmarkId: string;
  listId: string;
  action: "add" | "remove";
}

export interface OfflineSafeBookmarkDeletionInput {
  bookmarkId: string;
}

export interface OfflineQueuedMutation {
  kind: "queued";
}

export interface OfflineSafeBookmarkMutation<TInput, TResult> {
  mutate: (input: TInput) => void;
  mutateAsync: (input: TInput) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
}

export const OFFLINE_ONLINE_REQUIRED_MESSAGE =
  "This action requires an internet connection.";

class OfflineMutationOnlineRequiredError extends Error {
  constructor(message = OFFLINE_ONLINE_REQUIRED_MESSAGE) {
    super(message);
    this.name = "OfflineMutationOnlineRequiredError";
  }
}

export function isOfflineQueuedMutation(
  result: unknown,
): result is OfflineQueuedMutation {
  return (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    result.kind === "queued"
  );
}

function queueMutationIdempotencyKey(): string {
  if (typeof crypto?.randomUUID !== "function") {
    throw new Error("Offline writes require a UUID-capable browser");
  }
  return crypto.randomUUID();
}

const offlineTagIntentQueues = new Map<string, Promise<void>>();
const offlineListMembershipIntentQueues = new Map<string, Promise<void>>();

function serializeOfflineTagIntent<T>(
  bookmarkId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = offlineTagIntentQueues.get(bookmarkId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  offlineTagIntentQueues.set(bookmarkId, tail);
  void tail.finally(() => {
    if (offlineTagIntentQueues.get(bookmarkId) === tail) {
      offlineTagIntentQueues.delete(bookmarkId);
    }
  });
  return result;
}

function serializeOfflineListMembershipIntent<T>(
  bookmarkId: string,
  listId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${bookmarkId}:${listId}`;
  const previous =
    offlineListMembershipIntentQueues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  offlineListMembershipIntentQueues.set(key, tail);
  void tail.finally(() => {
    if (offlineListMembershipIntentQueues.get(key) === tail) {
      offlineListMembershipIntentQueues.delete(key);
    }
  });
  return result;
}

function getOfflineUpdateFields(
  input: ZUpdateBookmarksRequest,
): OfflineUpdateFields {
  for (const [field, value] of Object.entries(input)) {
    if (
      field !== "bookmarkId" &&
      field !== "textBaseVersion" &&
      value !== undefined &&
      !Object.hasOwn(OFFLINE_UPDATE_FIELD_SET, field)
    ) {
      throw new OfflineMutationOnlineRequiredError();
    }
  }

  return Object.fromEntries(
    OFFLINE_UPDATE_FIELDS.flatMap((field) => {
      const value = input[field];
      return value === undefined ? [] : [[field, value]];
    }),
  ) as OfflineUpdateFields;
}

async function getRequiredFieldVersions(
  bookmarkId: string,
  fields: string[],
): Promise<Record<string, number>> {
  const versions = await Promise.all(
    fields.map(
      async (field) =>
        [field, await getBookmarkFieldVersion(bookmarkId, field)] as const,
    ),
  );
  const baseVersions: Record<string, number> = {};
  for (const [field, version] of versions) {
    if (version === undefined) {
      throw new OfflineMutationOnlineRequiredError();
    }
    baseVersions[field] = version;
  }
  return baseVersions;
}

function useMutationState<TInput, TResult>(
  mutateAsync: (input: TInput) => Promise<TResult>,
  isPending: boolean,
  error: Error | null,
): OfflineSafeBookmarkMutation<TInput, TResult> {
  const mutate = useCallback(
    (input: TInput) => {
      void mutateAsync(input).catch(() => undefined);
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending, error };
}

export function useOfflineSafeBookmarkUpdate(): OfflineSafeBookmarkMutation<
  ZUpdateBookmarksRequest,
  ZBookmark | OfflineQueuedMutation
> {
  const { status, queueBookmarkUpdate } = useOfflineLibrary();
  const onlineMutation = useUpdateBookmark();
  const [isOfflinePending, setIsOfflinePending] = useState(false);
  const [offlineError, setOfflineError] = useState<Error | null>(null);
  const isOnline = status.kind === "online";

  const mutateAsync = useCallback(
    async (
      input: ZUpdateBookmarksRequest,
    ): Promise<ZBookmark | OfflineQueuedMutation> => {
      if (isOnline) {
        return await onlineMutation.mutateAsync(input);
      }

      setIsOfflinePending(true);
      setOfflineError(null);
      try {
        const fields = getOfflineUpdateFields(input);
        const changedFields = Object.keys(fields);
        if (changedFields.length === 0) {
          throw new OfflineMutationOnlineRequiredError();
        }
        const baseVersions = await getRequiredFieldVersions(
          input.bookmarkId,
          changedFields,
        );
        await queueBookmarkUpdate({
          idempotencyKey: queueMutationIdempotencyKey(),
          kind: "bookmark.update",
          bookmarkId: input.bookmarkId,
          fields,
          baseVersions,
        });
        return { kind: "queued" };
      } catch (error) {
        const mutationError =
          error instanceof Error ? error : new Error("Unable to save bookmark");
        setOfflineError(mutationError);
        throw mutationError;
      } finally {
        setIsOfflinePending(false);
      }
    },
    [isOnline, onlineMutation, queueBookmarkUpdate],
  );

  return useMutationState(
    mutateAsync,
    isOnline ? onlineMutation.isPending : isOfflinePending,
    isOnline ? (onlineMutation.error as Error | null) : offlineError,
  );
}

export function useOfflineSafeBookmarkTags(): OfflineSafeBookmarkMutation<
  OfflineSafeBookmarkTagsInput,
  unknown | OfflineQueuedMutation
> {
  const { status, queueBookmarkTags } = useOfflineLibrary();
  const onlineMutation = useUpdateBookmarkTags();
  const [isOfflinePending, setIsOfflinePending] = useState(false);
  const [offlineError, setOfflineError] = useState<Error | null>(null);
  const isOnline = status.kind === "online";

  const mutateAsync = useCallback(
    async (
      input: OfflineSafeBookmarkTagsInput,
    ): Promise<unknown | OfflineQueuedMutation> => {
      if (isOnline) {
        return await onlineMutation.mutateAsync(input);
      }

      setIsOfflinePending(true);
      setOfflineError(null);
      try {
        if (input.detach.some((tag) => !tag.tagId)) {
          throw new OfflineMutationOnlineRequiredError();
        }
        const createdTags: Extract<
          ZOfflineSyncMutation,
          { kind: "bookmark.tags" }
        >["createdTags"] = [];
        const attachedTagIds = input.attach.map((tag) => {
          if (tag.tagId) {
            return tag.tagId;
          }
          const name = normalizeTagName(tag.tagName ?? "").trim();
          if (!name) {
            throw new OfflineMutationOnlineRequiredError();
          }
          const id = queueMutationIdempotencyKey();
          createdTags.push({ id, name });
          return id;
        });

        return await serializeOfflineTagIntent(input.bookmarkId, async () => {
          const bookmark = await offlineLibraryDb.bookmarks.get(
            input.bookmarkId,
          );
          if (!bookmark) {
            throw new OfflineMutationOnlineRequiredError();
          }

          const tagIds = new Set(bookmark.tags.map((tag) => tag.id));
          for (const tag of input.detach) {
            tagIds.delete(tag.tagId!);
          }
          for (const tagId of attachedTagIds) {
            tagIds.add(tagId!);
          }

          const baseVersions = await getRequiredFieldVersions(
            input.bookmarkId,
            ["tags"],
          );
          await queueBookmarkTags({
            idempotencyKey: queueMutationIdempotencyKey(),
            kind: "bookmark.tags",
            bookmarkId: input.bookmarkId,
            tagIds: [...tagIds],
            createdTags,
            baseVersions: { tags: baseVersions.tags! },
          });
          return { kind: "queued" };
        });
      } catch (error) {
        const mutationError =
          error instanceof Error ? error : new Error("Unable to save tags");
        setOfflineError(mutationError);
        throw mutationError;
      } finally {
        setIsOfflinePending(false);
      }
    },
    [isOnline, onlineMutation, queueBookmarkTags],
  );

  return useMutationState(
    mutateAsync,
    isOnline ? onlineMutation.isPending : isOfflinePending,
    isOnline ? (onlineMutation.error as Error | null) : offlineError,
  );
}

export function useOfflineSafeBookmarkListMembership(): OfflineSafeBookmarkMutation<
  OfflineSafeBookmarkListMembershipInput,
  unknown | OfflineQueuedMutation
> {
  const { status, queueBookmarkListMembership } = useOfflineLibrary();
  const onlineAddMutation = useAddBookmarkToList();
  const onlineRemoveMutation = useRemoveBookmarkFromList();
  const [isOfflinePending, setIsOfflinePending] = useState(false);
  const [offlineError, setOfflineError] = useState<Error | null>(null);
  const isOnline = status.kind === "online";

  const mutateAsync = useCallback(
    async (
      input: OfflineSafeBookmarkListMembershipInput,
    ): Promise<unknown | OfflineQueuedMutation> => {
      if (isOnline) {
        const onlineInput = {
          bookmarkId: input.bookmarkId,
          listId: input.listId,
        };
        return input.action === "add"
          ? await onlineAddMutation.mutateAsync(onlineInput)
          : await onlineRemoveMutation.mutateAsync(onlineInput);
      }

      setIsOfflinePending(true);
      setOfflineError(null);
      try {
        return await serializeOfflineListMembershipIntent(
          input.bookmarkId,
          input.listId,
          async () => {
            const [bookmark, list] = await Promise.all([
              offlineLibraryDb.bookmarks.get(input.bookmarkId),
              offlineLibraryDb.lists.get(input.listId),
            ]);
            if (
              !bookmark ||
              !list ||
              list.type !== "manual" ||
              list.userRole === "viewer"
            ) {
              throw new OfflineMutationOnlineRequiredError();
            }
            await queueBookmarkListMembership({
              idempotencyKey: queueMutationIdempotencyKey(),
              kind: "bookmark.listMembership",
              ...input,
            });
            return { kind: "queued" };
          },
        );
      } catch (error) {
        const mutationError =
          error instanceof Error
            ? error
            : new Error("Unable to update bookmark lists");
        setOfflineError(mutationError);
        throw mutationError;
      } finally {
        setIsOfflinePending(false);
      }
    },
    [
      isOnline,
      onlineAddMutation,
      onlineRemoveMutation,
      queueBookmarkListMembership,
    ],
  );

  return useMutationState(
    mutateAsync,
    isOnline
      ? onlineAddMutation.isPending || onlineRemoveMutation.isPending
      : isOfflinePending,
    isOnline
      ? ((onlineAddMutation.error ??
          onlineRemoveMutation.error) as Error | null)
      : offlineError,
  );
}

export function useOfflineSafeBookmarkDeletion(): OfflineSafeBookmarkMutation<
  OfflineSafeBookmarkDeletionInput,
  unknown | OfflineQueuedMutation
> {
  const { status, queueBookmarkDelete } = useOfflineLibrary();
  const onlineMutation = useDeleteBookmark();
  const [isOfflinePending, setIsOfflinePending] = useState(false);
  const [offlineError, setOfflineError] = useState<Error | null>(null);
  const isOnline = status.kind === "online";

  const mutateAsync = useCallback(
    async (
      input: OfflineSafeBookmarkDeletionInput,
    ): Promise<unknown | OfflineQueuedMutation> => {
      if (isOnline) {
        return await onlineMutation.mutateAsync(input);
      }

      setIsOfflinePending(true);
      setOfflineError(null);
      try {
        const bookmark = await offlineLibraryDb.bookmarks.get(input.bookmarkId);
        if (!bookmark) {
          throw new OfflineMutationOnlineRequiredError();
        }
        await queueBookmarkDelete({
          idempotencyKey: queueMutationIdempotencyKey(),
          kind: "bookmark.delete",
          bookmarkId: input.bookmarkId,
        });
        return { kind: "queued" };
      } catch (error) {
        const mutationError =
          error instanceof Error
            ? error
            : new Error("Unable to delete bookmark");
        setOfflineError(mutationError);
        throw mutationError;
      } finally {
        setIsOfflinePending(false);
      }
    },
    [isOnline, onlineMutation, queueBookmarkDelete],
  );

  return useMutationState(
    mutateAsync,
    isOnline ? onlineMutation.isPending : isOfflinePending,
    isOnline ? (onlineMutation.error as Error | null) : offlineError,
  );
}
