// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import translations from "@/lib/i18n/locales/en/translation.json";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refresh: vi.fn(),
  close: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: i18next.t.bind(i18next) }),
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibraryStatus: () => ({ kind: "online" }),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/components/ui/action-button", () => ({
  ActionButton: ({
    loading: _loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading: boolean }) => (
    <button {...props} />
  ),
}));
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useEditBookmarkList: () => ({ mutateAsync: mocks.mutate, isPending: false }),
  useBookmarkLists: () => ({ isPending: false, error: null }),
}));
vi.mock("./BookmarkListSelector", () => ({
  BookmarkListSelector: ({
    value,
    onChange,
    ownerOnly,
    hideSubtreeOf,
    rootLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    ownerOnly: boolean;
    hideSubtreeOf: string;
    rootLabel: string;
  }) => {
    expect(ownerOnly).toBe(true);
    expect(hideSubtreeOf).toBe("source");
    return (
      <select
        aria-label="Destination"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{rootLabel}</option>
        <option value="parent">Current parent</option>
        <option value="destination">Destination</option>
      </select>
    );
  },
}));

import { MoveListModal } from "./MoveListModal";

const list = {
  id: "source",
  name: "Games",
  parentId: "parent",
  userRole: "owner",
  type: "manual",
  icon: "🎮",
  hasCollaborators: false,
  public: false,
} satisfies ZBookmarkList;
beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.mutate.mockResolvedValue(list);
  await i18next.init({
    lng: "en",
    resources: { en: { translation: translations } },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("moving a list", () => {
  it("requires explicit submission, warns before moving, and supports top level", async () => {
    render(<MoveListModal list={list} open setOpen={mocks.close} />);
    const submit = screen.getByRole("button", {
      name: "Move",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("note").textContent).toContain("inherited");
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(false));
    expect(mocks.mutate).toHaveBeenCalledWith({
      listId: "source",
      parentId: null,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the destination and dialog open when submission fails", async () => {
    mocks.mutate.mockRejectedValueOnce(new Error("Permission changed"));
    render(<MoveListModal list={list} open setOpen={mocks.close} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "destination" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Permission changed"),
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "destination",
    );
    expect(mocks.close).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
