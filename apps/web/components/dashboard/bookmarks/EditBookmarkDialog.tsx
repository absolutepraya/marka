import * as React from "react";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { useDialogFormReset } from "@/lib/hooks/useDialogFormReset";
import {
  isOfflineQueuedMutation,
  useOfflineSafeBookmarkUpdate,
} from "@/lib/hooks/useOfflineSafeBookmarkMutation";
import { useOfflineLibraryStatus } from "@/lib/offline-library/provider";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  BookmarkTypes,
  ZBookmark,
  zUpdateBookmarksRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import { getBookmarkTitle } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkTagsEditor } from "./BookmarkTagsEditor";

const formSchema = zUpdateBookmarksRequestSchema.extend({
  createdAt: z.date().optional(),
  datePublished: z.date().nullish(),
  dateModified: z.date().nullish(),
});
type BookmarkFormValues = z.infer<typeof formSchema>;

export function EditBookmarkDialog({
  open,
  setOpen,
  bookmark,
  children,
}: {
  bookmark: ZBookmark;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const offlineStatus = useOfflineLibraryStatus();
  const requiresOnline = offlineStatus.kind !== "online";

  const { data: assetContent, isLoading: isAssetContentLoading } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: bookmark.id,
        includeContent: true,
      },
      {
        enabled:
          open &&
          !requiresOnline &&
          bookmark.content.type === BookmarkTypes.ASSET,
        select: (b) =>
          b.content.type == BookmarkTypes.ASSET ? b.content.content : null,
      },
    ),
  );

  const bookmarkToDefault = (bookmark: ZBookmark): BookmarkFormValues => ({
    bookmarkId: bookmark.id,
    summary: bookmark.summary,
    note: bookmark.note === null ? undefined : bookmark.note,
    title: getBookmarkTitle(bookmark),
    createdAt: bookmark.createdAt ?? new Date(),
    // Link specific defaults (only if bookmark is a link)
    url:
      bookmark.content.type === BookmarkTypes.LINK
        ? bookmark.content.url
        : undefined,
    description:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.description ?? "")
        : undefined,
    author:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.author ?? "")
        : undefined,
    publisher:
      bookmark.content.type === BookmarkTypes.LINK
        ? (bookmark.content.publisher ?? "")
        : undefined,
    datePublished:
      bookmark.content.type === BookmarkTypes.LINK
        ? bookmark.content.datePublished
        : undefined,
    // Asset specific fields
    assetContent: assetContent ?? undefined,
  });

  const form = useForm<BookmarkFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: bookmarkToDefault(bookmark),
  });

  const updateBookmarkMutation = useOfflineSafeBookmarkUpdate();

  async function onSubmit(values: BookmarkFormValues) {
    const payload = {
      ...values,
      title: values.title ?? null,
    };
    try {
      const result = await updateBookmarkMutation.mutateAsync(payload);
      toast({
        description: isOfflineQueuedMutation(result)
          ? "Saved offline, will sync when connected"
          : "Bookmark details updated successfully!",
      });
      setOpen(false);
      form.reset(
        isOfflineQueuedMutation(result)
          ? bookmarkToDefault(bookmark)
          : bookmarkToDefault(result),
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to update bookmark",
        description:
          error instanceof Error ? error.message : "Unable to update bookmark",
      });
    }
  }

  // Reset form only when dialog is initially opened to preserve unsaved changes
  // This prevents losing unsaved title edits when tags are updated, which would
  // cause the bookmark prop to change and trigger a form reset
  useDialogFormReset(open, form, bookmarkToDefault(bookmark));

  // Update assetContent field when it's loaded
  React.useEffect(() => {
    if (assetContent && bookmark.content.type === BookmarkTypes.ASSET) {
      form.setValue("assetContent", assetContent);
    }
  }, [assetContent, bookmark.content.type, form]);

  const isLink = bookmark.content.type === BookmarkTypes.LINK;
  const isAsset = bookmark.content.type === BookmarkTypes.ASSET;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        position="bottom"
        className="left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x-0 border-b-0 bg-card p-0 shadow-2xl sm:bottom-auto sm:left-[50%] sm:top-[calc(var(--vvo)+var(--vvh)/2)] sm:max-h-[calc(var(--vvh)-5rem)] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-6 text-left sm:px-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {t("bookmark_editor.title")}
              </DialogTitle>
              <DialogDescription>
                {t("bookmark_editor.subtitle")}
                {requiresOnline && (
                  <span className="mt-2 block" role="status">
                    Dates and extracted asset content require an internet
                    connection.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex w-full flex-col gap-3 px-5 py-4 sm:px-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("common.title")}</FormLabel>
                    <FormControl>
                      <Input
                        className="h-10 w-full sm:h-11"
                        placeholder="Bookmark title"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isLink && (
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("common.url")}</FormLabel>
                      <FormControl>
                        <Input
                          className="h-10 w-full sm:h-11"
                          placeholder="https://example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t("common.note")}</FormLabel>
                    <FormControl>
                      <Textarea
                        className="min-h-20 resize-y sm:min-h-24"
                        placeholder="Bookmark notes"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isLink && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("common.description")}</FormLabel>
                        <FormControl>
                          <Textarea
                            className="min-h-20 resize-y sm:min-h-24"
                            placeholder="Bookmark description"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="summary"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("common.summary")}</FormLabel>
                        <FormControl>
                          <Textarea
                            className="min-h-20 resize-y sm:min-h-24"
                            placeholder="Bookmark summary"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {isAsset && (
                <FormField
                  control={form.control}
                  name="assetContent"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        {t("bookmark_editor.extracted_content")}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-28 resize-y sm:min-h-36"
                          disabled={isAssetContentLoading || requiresOnline}
                          placeholder="Extracted Content"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isLink && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="author"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("bookmark_editor.author")}</FormLabel>
                        <FormControl>
                          <Input
                            className="h-10 w-full sm:h-11"
                            placeholder="Author name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publisher"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("bookmark_editor.publisher")}</FormLabel>
                        <FormControl>
                          <Input
                            className="h-10 w-full sm:h-11"
                            placeholder="Publisher name"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="createdAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{t("common.created_at")}</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              disabled={requiresOnline}
                              title={
                                requiresOnline
                                  ? "This action requires an internet connection."
                                  : undefined
                              }
                              variant="outline"
                              className={cn(
                                "h-10 w-full pl-3 text-left font-normal sm:h-11",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>{t("bookmark_editor.pick_a_date")}</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isLink && (
                  <FormField
                    control={form.control}
                    name="datePublished"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>
                          {t("bookmark_editor.date_published")}
                        </FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                disabled={requiresOnline}
                                title={
                                  requiresOnline
                                    ? "This action requires an internet connection."
                                    : undefined
                                }
                                variant="outline"
                                className={cn(
                                  "h-10 w-full pl-3 text-left font-normal sm:h-11",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>
                                    {t("bookmark_editor.pick_a_date")}
                                  </span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ?? undefined}
                              onSelect={(date) => field.onChange(date ?? null)}
                              disabled={(date) =>
                                date > new Date() ||
                                date < new Date("1900-01-01")
                              }
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormItem className="flex w-full flex-col">
                <FormLabel>{t("common.tags")}</FormLabel>
                <FormControl>
                  <BookmarkTagsEditor
                    bookmark={bookmark}
                    className="min-h-10 sm:min-h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </div>

            <div className="sticky bottom-0 flex gap-2 border-t border-border/70 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6 sm:py-4">
              <Button
                type="button"
                variant="secondary"
                className="h-11 flex-1"
                onClick={() => setOpen(false)}
                disabled={updateBookmarkMutation.isPending}
              >
                {t("actions.cancel")}
              </Button>
              <ActionButton
                type="submit"
                loading={updateBookmarkMutation.isPending}
                className="h-11 flex-1"
              >
                {t("bookmark_editor.save_changes")}
              </ActionButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
