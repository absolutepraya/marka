import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/bookmarks/Bookmarks", () => ({
  default: () => null,
}));
vi.mock("@/components/dashboard/lists/ListHeader", () => ({
  default: () => null,
}));
vi.mock("@/components/dashboard/tags/TagHeader", () => ({
  default: () => null,
}));
vi.mock("@karakeep/shared-react/hooks/bookmark-list-context", () => ({
  BookmarkListContextProvider: () => null,
}));
vi.mock("@/server/api/client", () => ({
  api: { lists: { get: vi.fn() }, tags: { get: vi.fn() } },
}));

import { generateMetadata as listMetadata } from "./dashboard/lists/[listId]/page";
import { generateMetadata as tagMetadata } from "./dashboard/tags/[tagId]/page";
import { api } from "@/server/api/client";

describe.each(["UNAUTHORIZED", "FORBIDDEN"] as const)("%s metadata", (code) => {
  it("lets private lists inherit generic metadata when access is denied", async () => {
    vi.mocked(api.lists.get).mockRejectedValueOnce(new TRPCError({ code }));
    await expect(
      listMetadata({ params: Promise.resolve({ listId: "private" }) }),
    ).resolves.toEqual({});
  });

  it("lets private tags inherit generic metadata when access is denied", async () => {
    vi.mocked(api.tags.get).mockRejectedValueOnce(new TRPCError({ code }));
    await expect(
      tagMetadata({ params: Promise.resolve({ tagId: "private" }) }),
    ).resolves.toEqual({});
  });
});

it("still surfaces unexpected title lookup failures", async () => {
  const error = new Error("Database unavailable");
  vi.mocked(api.lists.get).mockRejectedValueOnce(error);
  vi.mocked(api.tags.get).mockRejectedValueOnce(error);
  await expect(
    listMetadata({ params: Promise.resolve({ listId: "private" }) }),
  ).rejects.toBe(error);
  await expect(
    tagMetadata({ params: Promise.resolve({ tagId: "private" }) }),
  ).rejects.toBe(error);
});
