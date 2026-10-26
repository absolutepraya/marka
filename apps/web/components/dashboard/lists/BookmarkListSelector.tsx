import { ReactNode, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import LoadingSpinner from "@/components/ui/spinner";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";
import { truncateListPath } from "./listPath";

interface DataProps {
  isPending: boolean;
  allPaths?: ZBookmarkList[][];
  rootLabel?: string;
}

interface ListSelectorComponentProps extends DataProps {
  onSelect: (value: string) => void;
  isItemSelected: (id: string) => boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  listboxId: string;
}

interface SingleSelectionProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiSelect?: false;
  disabled?: boolean;
}

interface MultiSelectionProps {
  value: string[] | null;
  onChange: (value: string[]) => void;
  multiSelect: true;
  placeholder?: string;
  className?: string;
}

interface SelectionProps {
  ownerOnly?: boolean;
  rootLabel?: string;
  hideSubtreeOf?: string;
  hideBookmarkIds?: string[];
  listTypes?: ZBookmarkList["type"][];
  disabled?: boolean;
  allPathsOverride?: ZBookmarkList[][];
}

type BookmarkListSelectorProps = SelectionProps &
  (SingleSelectionProps | MultiSelectionProps);

function ListSelectorComponent({
  onSelect,
  children,
  isItemSelected,
  open,
  setOpen,
  isPending,
  allPaths,
  disabled,
  listboxId,
  rootLabel,
}: ListSelectorComponentProps) {
  const [searchValue, setSearchValue] = useState("");
  const isMobile = useIsMobile();
  const filteredPaths = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!allPaths || !query) {
      return allPaths;
    }
    return allPaths.filter((path) => {
      const list = path[path.length - 1];
      return [listNameFromPath(path), list.name, list.icon].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [allPaths, searchValue]);
  const visiblePaths = isMobile ? filteredPaths?.slice(0, 3) : filteredPaths;

  if (isPending) {
    return <LoadingSpinner />;
  }

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearchValue("");
          }
        }
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={searchValue}
            onValueChange={setSearchValue}
            placeholder="Search lists..."
          />
          <CommandList id={listboxId}>
            <CommandEmpty>
              {allPaths?.length === 0
                ? "You don't currently have any lists."
                : "No lists found."}
            </CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {rootLabel &&
                (!searchValue.trim() ||
                  rootLabel
                    .toLowerCase()
                    .includes(searchValue.trim().toLowerCase())) && (
                  <CommandItem
                    value="__library_root__"
                    onSelect={() => onSelect("")}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        isItemSelected("") ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {rootLabel}
                  </CommandItem>
                )}
              {visiblePaths?.map((path) => {
                const list = path[path.length - 1];
                const fullName = listNameFromPath(path);
                const name = truncateListPath(path);
                return (
                  <CommandItem
                    key={list.id}
                    value={list.id}
                    keywords={[list.name, list.icon]}
                    onSelect={onSelect}
                    className="min-w-0 cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isItemSelected(list.id) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate" title={fullName}>
                      {name}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BookmarkListSingleSelector({
  placeholder = "Select a list",
  className,
  onChange,
  value,
  isPending,
  allPaths,
  disabled,
  rootLabel,
}: SingleSelectionProps & DataProps) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const onSelect = (currentValue: string) => {
    onChange(currentValue);
    setOpen(false);
  };

  const isItemSelected = (id: string) => id === value;

  // Find the selected list's display name
  const selectedListPath = allPaths?.find(
    (path) => path[path.length - 1].id === value,
  );
  const selectedListName = selectedListPath
    ? truncateListPath(selectedListPath)
    : null;
  const selectedListTitle = selectedListPath
    ? listNameFromPath(selectedListPath)
    : undefined;
  return (
    <ListSelectorComponent
      onSelect={onSelect}
      open={open}
      isItemSelected={isItemSelected}
      setOpen={setOpen}
      isPending={isPending}
      allPaths={allPaths}
      disabled={disabled}
      listboxId={listboxId}
      rootLabel={rootLabel}
    >
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={cn("w-full min-w-0 justify-between", className)}
        disabled={disabled}
      >
        <span className="min-w-0 flex-1 truncate" title={selectedListTitle}>
          {selectedListName || (!value && rootLabel ? rootLabel : placeholder)}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </ListSelectorComponent>
  );
}

function BookmarkListMultiSelector({
  placeholder = "Select lists",
  onChange,
  value,
  isPending,
  allPaths,
  className,
  disabled,
}: MultiSelectionProps & DataProps & { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const selectedListIdSet = new Set(value);
  const onSelect = (currentValue: string) => {
    if (disabled) {
      return;
    }
    const newValue = selectedListIdSet.has(currentValue)
      ? (value ?? []).filter((id) => id !== currentValue)
      : [...(value ?? []), currentValue];
    onChange(newValue);
  };
  const removeSelection = (removedId?: string) => {
    if (!disabled && value && removedId) {
      onChange(value.filter((id) => id !== removedId));
    }
  };

  const isItemSelected = (id: string) => selectedListIdSet.has(id);

  const selectedListsPaths = allPaths?.filter((path) =>
    selectedListIdSet.has(path[path.length - 1].id),
  );
  return (
    <ListSelectorComponent
      onSelect={onSelect}
      open={open}
      isItemSelected={isItemSelected}
      setOpen={setOpen}
      isPending={isPending}
      allPaths={allPaths}
      disabled={disabled}
      listboxId={listboxId}
    >
      <div
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-expanded={disabled ? false : open}
        aria-controls={listboxId}
        className={cn(
          "relative flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background transition-colors",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        onKeyDown={(e) => {
          if (disabled) {
            return;
          }
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
      >
        {selectedListsPaths && selectedListsPaths.length > 0 ? (
          <>
            {selectedListsPaths.map((path) => {
              const listName = truncateListPath(path);
              const fullListName = listNameFromPath(path);
              const listId = path.at(-1)?.id;
              return (
                <div
                  key={listId}
                  className="flex min-h-7 max-w-full space-x-1 rounded bg-accent px-2"
                >
                  <div className="m-auto flex min-w-0 gap-2">
                    <span className="truncate" title={fullListName}>
                      {listName}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      className="shrink-0 cursor-pointer rounded-full outline-none ring-offset-background focus:ring-1 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSelection(listId);
                      }}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Remove {fullListName}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          placeholder
        )}
      </div>
    </ListSelectorComponent>
  );
}
export function BookmarkListSelector(props: BookmarkListSelectorProps) {
  const { data, isPending } = useBookmarkLists(undefined, {
    enabled: props.allPathsOverride === undefined,
  });
  const {
    hideSubtreeOf,
    ownerOnly = false,
    hideBookmarkIds = [],
    listTypes = ["manual", "smart"],
    allPathsOverride,
    ...selectorProps
  } = props;
  let { allPaths } = data ?? {};
  allPaths = allPathsOverride ?? allPaths;
  const hiddenBookmarkIdSet = new Set(hideBookmarkIds);
  const listTypeSet = new Set(listTypes);
  allPaths = allPaths?.filter((path) => {
    const lastItem = path[path.length - 1];
    if (
      hiddenBookmarkIdSet.has(lastItem.id) ||
      (ownerOnly && lastItem.userRole !== "owner") ||
      !listTypeSet.has(lastItem.type)
    ) {
      return false;
    }
    // Hide lists where user is a viewer (can't add/remove bookmarks)
    if (lastItem.userRole === "viewer") {
      return false;
    }
    if (!hideSubtreeOf) {
      return true;
    }
    return !path.some((item) => item.id === hideSubtreeOf);
  });

  return selectorProps.multiSelect ? (
    <BookmarkListMultiSelector
      {...selectorProps}
      isPending={allPathsOverride === undefined && isPending}
      allPaths={allPaths}
    />
  ) : (
    <BookmarkListSingleSelector
      {...selectorProps}
      isPending={allPathsOverride === undefined && isPending}
      allPaths={allPaths}
    />
  );
}
