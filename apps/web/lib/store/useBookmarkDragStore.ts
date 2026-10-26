import { create } from "zustand";

// Shared across list trees so one submitted drop cannot be submitted twice.
export const useBookmarkDragStore = create<{ isDropping: boolean }>(() => ({
  isDropping: false,
}));
