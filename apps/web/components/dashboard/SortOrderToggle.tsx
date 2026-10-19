"use client";

import { useEffect } from "react";
import { EditingButton } from "@/components/ui/editing-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/client";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { ListFilter, SortAsc, SortDesc } from "lucide-react";

export default function SortOrderToggle() {
  const { t } = useTranslation();
  const isInSearchPage = useInSearchPageStore((state) => state.inSearchPage);

  const { sortOrder: currentSort, setSortOrder } = useSortOrderStore();

  // also see related on page enter sortOrder.relevance init
  // in apps/web/app/dashboard/search/page.tsx
  useEffect(() => {
    if (!isInSearchPage && currentSort === "relevance") {
      // reset to default sort order
      setSortOrder("desc");
    }
  }, [isInSearchPage, currentSort, setSortOrder]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EditingButton
          tooltip={t("actions.sort.title")}
          aria-label={t("actions.sort.title")}
          ignoreDemoMode
          variant="ghost"
        >
          {currentSort === "relevance" && <ListFilter size={16} />}
          {currentSort === "asc" && <SortAsc size={16} />}
          {currentSort === "desc" && <SortDesc size={16} />}
        </EditingButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit">
        <DropdownMenuRadioGroup
          value={currentSort}
          onValueChange={(value) => setSortOrder(value as typeof currentSort)}
        >
          {isInSearchPage && (
            <DropdownMenuRadioItem value="relevance">
              <ListFilter size={16} />
              {t("actions.sort.relevant_first")}
            </DropdownMenuRadioItem>
          )}
          <DropdownMenuRadioItem value="desc">
            <SortDesc size={16} />
            {t("actions.sort.newest_first")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="asc">
            <SortAsc size={16} />
            {t("actions.sort.oldest_first")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
