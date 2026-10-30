"use client";

import React, { useState } from "react";
import EditorCard from "@/components/dashboard/bookmarks/EditorCard";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ResponsiveDialogContent,
} from "@/components/ui/dialog";
import { haptic } from "@/lib/haptic";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

// The right-most item in the floating mobile nav: a capture button that
// pops the new-item capture card in a dialog, closing once a bookmark is added.
export default function MobileAddButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("editor.new_item", { defaultValue: "New item" });

  return (
    <li className="flex min-w-[44px] shrink-0 grow basis-11">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          type="button"
          onClick={() => {
            // Keep the capture flow independent of Radix's composed trigger
            // handler. This is more reliable on mobile browsers, where the
            // haptic shim also runs as part of the tap.
            setOpen(true);
            haptic();
          }}
          aria-label={label}
          title={label}
          className={cn(
            buttonVariants({ size: "none" }),
            "min-h-[52px] w-full rounded-[14px] px-1.5 py-2 focus-visible:ring-inset focus-visible:ring-offset-0 active:scale-[0.96]",
          )}
        >
          <span className="flex size-6 items-center justify-center">
            <Plus size={24} strokeWidth={2} />
          </span>
        </DialogTrigger>
        <ResponsiveDialogContent
          hideCloseBtn
          className="max-h-[calc(var(--vvh)-2rem)] gap-0 p-3 sm:max-h-[calc(var(--vvh)-2rem)] sm:max-w-md sm:p-4"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {t("editor.capture.dialog_description")}
            </DialogDescription>
          </DialogHeader>
          <EditorCard
            className="mb-[calc(env(safe-area-inset-bottom)+1.5rem)] min-h-[22rem]"
            onCreated={() => setOpen(false)}
          />
        </ResponsiveDialogContent>
      </Dialog>
    </li>
  );
}
