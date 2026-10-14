"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  useCreateBookmarkList,
  useEditBookmarkList,
} from "@karakeep/shared-react/hooks/lists";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import {
  ZBookmarkList,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import QueryExplainerTooltip from "../search/QueryExplainerTooltip";
import { BookmarkListSelector } from "./BookmarkListSelector";
import { resolveListParentId } from "./listParent";

export { resolveListParentId } from "./listParent";

export function EditListModal({
  open: userOpen,
  setOpen: userSetOpen,
  list,
  prefill,
  children,
}: {
  open?: boolean;
  setOpen?: (v: boolean) => void;
  list?: ZBookmarkList;
  prefill?: Partial<Omit<ZBookmarkList, "id">>;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = resolveListParentId(list, prefill, usePathname());
  if (
    (userOpen !== undefined && !userSetOpen) ||
    (userOpen === undefined && userSetOpen)
  ) {
    throw new Error("You must provide both open and setOpen or neither");
  }
  const [customOpen, customSetOpen] = useState(false);
  const isMobile = useIsMobile();

  const form = useForm({
    resolver: zodResolver(zNewBookmarkListSchema),
    defaultValues: {
      name: list?.name ?? prefill?.name ?? "",
      description: list?.description ?? prefill?.description ?? "",
      icon: list?.icon ?? prefill?.icon ?? "📁",
      parentId,
      type: list?.type ?? prefill?.type ?? "manual",
      query: list?.query ?? prefill?.query ?? undefined,
    },
  });
  const [open, setOpen] = [
    userOpen ?? customOpen,
    userSetOpen ?? customSetOpen,
  ];

  useEffect(() => {
    form.reset({
      name: list?.name ?? prefill?.name ?? "",
      description: list?.description ?? prefill?.description ?? "",
      icon: list?.icon ?? prefill?.icon ?? "📁",
      parentId,
      type: list?.type ?? prefill?.type ?? "manual",
      query: list?.query ?? prefill?.query ?? undefined,
    });
  }, [open]);

  const parsedSearchQuery = useMemo(() => {
    const query = form.getValues().query;
    if (!query) {
      return undefined;
    }
    return parseSearchQuery(query);
  }, [form.watch("query")]);

  const { mutate: createList, isPending: isCreating } = useCreateBookmarkList({
    onSuccess: (resp) => {
      toast({
        description: t("toasts.lists.created"),
      });
      setOpen(false);
      router.push(`/dashboard/lists/${resp.id}`);
      form.reset();
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });

  const { mutate: editList, isPending: isEditing } = useEditBookmarkList({
    onSuccess: () => {
      toast({
        description: t("toasts.lists.updated"),
      });
      setOpen(false);
      form.reset();
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });
  const listType = form.watch("type");

  useEffect(() => {
    if (listType !== "smart") {
      form.resetField("query");
    }
  }, [listType]);

  const isEdit = !!list;
  const isPending = isCreating || isEditing;

  const onSubmit = form.handleSubmit(
    (value: z.infer<typeof zNewBookmarkListSchema>) => {
      value.parentId = value.parentId === "" ? null : value.parentId;
      value.query = value.type === "smart" ? value.query : undefined;
      if (isEdit) {
        editList({ ...value, listId: list.id });
      } else {
        createList(value);
      }
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(s) => {
        form.reset();
        setOpen(s);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        position="bottom"
        className="left-0 top-auto w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-[1.75rem] border-x-0 border-b-0 bg-card p-0 shadow-2xl sm:bottom-auto sm:left-[50%] sm:top-[calc(var(--vvo)+var(--vvh)/2)] sm:max-h-[calc(var(--vvh)-2rem)] sm:max-w-md sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-6 text-left sm:px-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {isEdit ? t("lists.edit_list") : t("lists.new_list")}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Update this list's details and organization."
                  : "Set its name, location, and type."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
              <div className="flex w-full items-end gap-2">
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => {
                    return (
                      <FormItem className="shrink-0">
                        <FormControl>
                          <Popover>
                            <PopoverTrigger
                              aria-label={t("lists.icon", {
                                defaultValue: "Choose list emoji",
                              })}
                              className="shadow-xs flex size-10 items-center justify-center rounded-xl border border-input bg-muted/40 text-xl transition-[border-color,background-color,box-shadow] duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-11 sm:text-2xl"
                            >
                              {field.value}
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              collisionPadding={8}
                              className="max-h-[min(var(--radix-popover-content-available-height),calc(var(--vvh)-1rem))] w-fit max-w-[calc(100vw-1rem)] overflow-auto border-0 bg-transparent p-0 shadow-none [&_em-emoji-picker]:h-[min(290px,var(--radix-popover-content-available-height))] [&_em-emoji-picker]:min-h-0 sm:[&_em-emoji-picker]:h-[min(435px,var(--radix-popover-content-available-height))]"
                            >
                              <Picker
                                data={data}
                                emojiSize={isMobile ? 18 : 24}
                                emojiButtonSize={isMobile ? 30 : 36}
                                perLine={isMobile ? 8 : 9}
                                previewPosition={isMobile ? "none" : undefined}
                                skinTonePosition={isMobile ? "none" : undefined}
                                onEmojiSelect={(e: { native: string }) =>
                                  field.onChange(e.native)
                                }
                              />
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => {
                    return (
                      <FormItem className="min-w-0 flex-1">
                        <FormLabel>
                          {t("lists.name", { defaultValue: "Name" })}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            className="h-10 w-full sm:h-11"
                            placeholder="e.g. Design inspiration"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  return (
                    <FormItem className="space-y-2">
                      <FormLabel>{t("lists.description")}</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          className="h-10 w-full sm:h-11"
                          placeholder="Optional context for this list"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => {
                  return (
                    <FormItem className="space-y-2">
                      <FormLabel>{t("lists.parent_list")}</FormLabel>
                      <div className="flex items-center gap-1">
                        <FormControl>
                          <BookmarkListSelector
                            // Hide the current list from the list of parents
                            hideSubtreeOf={list ? list.id : undefined}
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t("lists.no_parent")}
                            className="h-10 sm:h-11"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-10 shrink-0 rounded-xl sm:size-11"
                          aria-label={t("lists.no_parent", {
                            defaultValue: "Remove parent list",
                          })}
                          onClick={() => {
                            form.setValue("parentId", "");
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => {
                  return (
                    <FormItem className="space-y-2">
                      <FormLabel>{t("lists.list_type")}</FormLabel>
                      <FormControl>
                        <Select
                          disabled={isEdit}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="h-10 w-full sm:h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">
                              {t("lists.manual_list")}
                            </SelectItem>
                            <SelectItem value="smart">
                              {t("lists.smart_list")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              {listType === "smart" && (
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => {
                    return (
                      <FormItem className="rounded-xl border border-border/70 bg-muted/30 p-3">
                        <FormLabel>{t("lists.search_query")}</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={t("lists.search_query")}
                              className="h-10 sm:h-11"
                              endIcon={
                                parsedSearchQuery ? (
                                  <QueryExplainerTooltip
                                    className="stroke-foreground p-1"
                                    parsedSearchQuery={parsedSearchQuery}
                                  />
                                ) : undefined
                              }
                            />
                          </FormControl>
                        </div>
                        <FormDescription>
                          <Link
                            href="https://docs.karakeep.app/Guides/search-query-language"
                            className="italic"
                            target="_blank"
                          >
                            {t("lists.search_query_help")}
                          </Link>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t border-border/70 bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6 sm:py-4">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 flex-1"
                >
                  {t("actions.close")}
                </Button>
              </DialogClose>
              <ActionButton
                type="submit"
                loading={isPending}
                className="h-11 flex-1"
              >
                {list ? t("actions.save") : t("actions.create")}
              </ActionButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
