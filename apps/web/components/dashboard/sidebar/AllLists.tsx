"use client";

import ListTreePicker from "@/components/dashboard/lists/ListTreePicker";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function AllLists({
  initialData,
}: {
  initialData: { lists: ZBookmarkList[] };
}) {
  return <ListTreePicker initialData={initialData} />;
}
