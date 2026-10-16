// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { matchSearchLists, OnlineSearchListResults } from "./SearchListResults";

const lists = vi.hoisted(
  () =>
    [
      { id: "parent", name: "Engineering", icon: "📁", parentId: null },
      { id: "nested", name: "React", icon: "📁", parentId: "parent" },
      { id: "root", name: "React", icon: "📁", parentId: null },
      { id: "more", name: "React Native", icon: "📁", parentId: null },
    ] as ZBookmarkList[],
);
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useBookmarkLists: () => ({ data: { data: lists } }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../lists/ListNavigation", () => ({
  SublistNavigation: ({
    lists,
    heading,
    getDescription,
  }: {
    lists: ZBookmarkList[];
    heading: string;
    getDescription: (list: ZBookmarkList) => string | undefined;
  }) => (
    <section aria-label={heading}>
      {lists.map((list) => (
        <a key={list.id} href={`/dashboard/lists/${list.id}`}>
          {list.name} {getDescription(list)}
        </a>
      ))}
    </section>
  ),
}));
afterEach(cleanup);

test("matches all words, ranks exact names first, and preserves duplicate folders", () => {
  expect(matchSearchLists(lists, " react ").map((list) => list.id)).toEqual([
    "nested",
    "root",
    "more",
  ]);
  expect(
    matchSearchLists(lists, "native react").map((list) => list.id),
  ).toEqual(["more"]);
  expect(matchSearchLists(lists, " ")).toEqual([]);
});

test("renders navigable lists with parent context for duplicate names", () => {
  render(<OnlineSearchListResults text="react" />);
  expect(
    screen
      .getByRole("link", { name: "React Engineering" })
      .getAttribute("href"),
  ).toBe("/dashboard/lists/nested");
  expect(screen.getByRole("link", { name: "React" }).getAttribute("href")).toBe(
    "/dashboard/lists/root",
  );
});
