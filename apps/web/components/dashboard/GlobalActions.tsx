"use client";

import BulkBookmarksAction from "@/components/dashboard/BulkBookmarksAction";
import SortOrderToggle from "@/components/dashboard/SortOrderToggle";
import ViewOptions from "@/components/dashboard/ViewOptions";
import { useTranslation } from "@/lib/i18n/client";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { Keyboard } from "lucide-react";

import { EditingButton } from "@/components/ui/editing-button";

export default function GlobalActions() {
  const { t } = useTranslation();
  const setShortcutsDialogOpen = useKeyboardNavigationStore(
    (state) => state.setShortcutsDialogOpen,
  );
  return (
    <div
      role="group"
      aria-label={t("keyboard_shortcuts.sections.actions")}
      className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5"
    >
      <ViewOptions />
      <BulkBookmarksAction />
      <SortOrderToggle />
      <span className="hidden sm:inline-flex">
        <EditingButton
          ignoreDemoMode
          variant="ghost"
          onClick={() => setShortcutsDialogOpen(true)}
          tooltip={t("keyboard_shortcuts.title")}
          aria-label={t("keyboard_shortcuts.title")}
        >
          <Keyboard size={16} />
        </EditingButton>
      </span>
    </div>
  );
}
