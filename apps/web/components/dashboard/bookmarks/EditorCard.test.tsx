// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureComposerProvider } from "@/lib/capture-composer";
import translations from "@/lib/i18n/locales/en/translation.json";

import EditorCard from "./EditorCard";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  deleteAsset: vi.fn(),
  addToList: vi.fn(),
  tags: vi.fn(),
  offlineCreate: vi.fn(),
  offlineList: vi.fn(),
  offline: false,
  userId: "user-1",
  mobile: false,
  demo: false,
  tagId: undefined as string | undefined,
}));
vi.mock("@/lib/auth/client", () => ({
  useSession: () => ({ data: { user: { id: mocks.userId } } }),
}));
vi.mock("@/lib/offline-library/provider", () => ({
  useOfflineLibrary: () => ({
    status: { kind: mocks.offline ? "offline" : "ready" },
    queueBookmarkCreate: mocks.offlineCreate,
    queueBookmarkListMembership: mocks.offlineList,
  }),
}));
vi.mock("@karakeep/shared-react/hooks/bookmarks", () => ({
  useCreateBookmark: () => ({ mutateAsync: mocks.create }),
  useUpdateBookmarkTags: () => ({ mutateAsync: mocks.tags }),
}));
vi.mock("@karakeep/shared-react/hooks/assets", () => ({
  useDeleteUnattachedAsset: () => ({ mutateAsync: mocks.deleteAsset }),
}));
vi.mock("@karakeep/shared-react/hooks/lists", () => ({
  useAddBookmarkToList: () => ({ mutateAsync: mocks.addToList }),
}));
vi.mock("@/lib/hooks/upload-file", () => ({
  default: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bookmarks",
}));
vi.mock("@/components/ui/kbd", () => ({
  Kbd: ({ children }: { children: React.ReactNode }) => <kbd>{children}</kbd>,
}));
vi.mock("@/components/ui/spinner", () => ({
  default: () => <span>Loading</span>,
}));
vi.mock("@karakeep/shared-react/hooks/bookmark-list-context", () => ({
  useBookmarkListContext: () => undefined,
}));
vi.mock("@karakeep/shared-react/hooks/bookmark-grid-context", () => ({
  useBookmarkGridContext: () => ({ tagId: mocks.tagId }),
}));
vi.mock("@/lib/hooks/useIsMobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: mocks.demo }),
}));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let value: unknown = translations;
      for (const part of key.split("."))
        value = (value as Record<string, unknown>)?.[part];
      return String(value ?? options?.defaultValue ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(options?.[name] ?? ""),
      );
    },
  }),
}));
vi.mock("@/components/dashboard/lists/BookmarkListSelector", () => ({
  BookmarkListSelector: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
  }) => (
    <select
      aria-label="Destination"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">Home</option>
      <option value="list-1">Reading</option>
    </select>
  ),
}));

function makeFile(
  name: string,
  type: string,
  source: string | Uint8Array = "test",
) {
  const bytes =
    typeof source === "string" ? new TextEncoder().encode(source) : source;
  const file = new File([bytes as BlobPart], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.buffer,
  });
  return file;
}
function transfer(files: File[]) {
  return {
    files,
    items: files.map((file) => ({
      kind: "file",
      type: file.type,
      getAsFile: () => file,
    })),
    types: ["Files"],
  };
}
function setup(show = true) {
  return render(
    <CaptureComposerProvider>
      <div data-testid="outside">Outside</div>
      {show && <EditorCard />}
    </CaptureComposerProvider>,
  );
}
async function drop(
  files: File[],
  target = screen.getByRole("form", { name: "NEW ITEM" }),
) {
  await act(async () => {
    fireEvent.drop(target, { dataTransfer: transfer(files) });
  });
}
function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
}

describe("New Item capture composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offline = false;
    mocks.mobile = false;
    mocks.demo = false;
    mocks.userId = "user-1";
    mocks.tagId = undefined;
    mocks.create.mockImplementation(async () => ({
      id: `bookmark-${mocks.create.mock.calls.length}`,
      alreadyExists: false,
    }));
    mocks.upload.mockImplementation(async (file: File) => ({
      assetId: `asset-${file.name}`,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }));
    mocks.addToList.mockResolvedValue({});
    mocks.tags.mockResolvedValue({});
    mocks.deleteAsset.mockResolvedValue({});
    mocks.offlineCreate.mockResolvedValue({});
    mocks.offlineList.mockResolvedValue({});
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });
  afterEach(cleanup);

  it("opens the file picker from the whole drop area and stages dropped files", async () => {
    setup();
    const area = screen.getByRole("button", { name: "Choose or drop files" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const open = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(area);
    expect(open).toHaveBeenCalledOnce();
    await drop([makeFile("notes.md", "text/markdown", "# Notes")], area);
    expect(screen.getByText("notes.md")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("ignores drops outside the card and stages card drops without uploading", async () => {
    setup();
    const file = makeFile("photo.png", "image/png");
    await drop([file], screen.getByTestId("outside"));
    expect(screen.queryByText("photo.png")).toBeNull();
    await drop([file]);
    expect(screen.getByText("photo.png")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo.png" }));
    expect(screen.queryByText("photo.png")).toBeNull();
  });

  it("stacks the newest four files inside the drop area and reveals older files on demand", async () => {
    setup();
    const area = screen.getByRole("button", { name: "Choose or drop files" });
    await drop(
      Array.from({ length: 4 }, (_, index) =>
        makeFile(`file-${index + 1}.pdf`, "application/pdf"),
      ),
      area,
    );
    expect(
      screen.queryByRole("button", { name: /Show .* older files/ }),
    ).toBeNull();
    await drop(
      [
        makeFile("file-5.pdf", "application/pdf"),
        makeFile("file-6.pdf", "application/pdf"),
      ],
      area,
    );
    const pending = screen.getByRole("list", { name: "Pending items" });
    expect(area.parentElement?.contains(pending)).toBe(true);
    expect(
      Array.from(pending.querySelectorAll("li")).map(
        (row) => row.querySelector("p")?.textContent,
      ),
    ).toEqual(["file-6.pdf", "file-5.pdf", "file-4.pdf", "file-3.pdf"]);
    expect(screen.queryByText("file-1.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: /^Save 6 items/ })).toBeTruthy();
    const reveal = screen.getByRole("button", { name: "Show 2 older files" });
    expect(reveal.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reveal);
    expect(pending.querySelectorAll("li")).toHaveLength(6);
    const collapse = screen.getByRole("button", { name: "Collapse files" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapse);
    expect(pending.querySelectorAll("li")).toHaveLength(4);
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const open = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove file-6.pdf" }));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText("file-2.pdf")).toBeTruthy();
    open.mockRestore();
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove file-5.pdf" }));
    expect(
      screen.queryByRole("button", { name: /Show .* older files/ }),
    ).toBeNull();
    expect(screen.getByText("file-1.pdf")).toBeTruthy();
    clickSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(4));
    expect(mocks.upload.mock.calls.map(([file]) => file.name)).toEqual([
      "file-1.pdf",
      "file-2.pdf",
      "file-3.pdf",
      "file-4.pdf",
    ]);
  });

  it("reveals failures in the older batch after saving a collapsed stack", async () => {
    mocks.upload.mockRejectedValue(new Error("Upload interrupted"));
    setup();
    await drop(
      Array.from({ length: 6 }, (_, index) =>
        makeFile(`file-${index + 1}.pdf`, "application/pdf"),
      ),
    );
    expect(screen.queryByText("file-1.pdf")).toBeNull();
    clickSave();
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(6));
    expect(screen.getByText("file-1.pdf")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Collapse files" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves mixed text and files in order into the selected list", async () => {
    setup();
    await drop([
      makeFile("photo.png", "image/png"),
      makeFile("notes.md", "text/markdown", "# Hello"),
      makeFile("clip.mp4", "video/mp4"),
      makeFile("song.mp3", "audio/mpeg"),
    ]);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My note" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "list-1" },
    });
    clickSave();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.create.mock.calls.map(([input]) => input.type)).toEqual([
      "asset",
      "text",
      "asset",
      "asset",
      "text",
    ]);
    expect(mocks.create.mock.calls[1][0]).toMatchObject({
      text: "# Hello",
      title: "notes",
      format: "markdown",
    });
    expect(mocks.addToList).toHaveBeenCalledTimes(5);
    expect(
      mocks.addToList.mock.calls.every(([input]) => input.listId === "list-1"),
    ).toBe(true);
  });

  it("retains failed items and retries without repeating successful uploads", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Upload interrupted"));
    setup();
    await drop([
      makeFile("first.pdf", "application/pdf"),
      makeFile("second.pdf", "application/pdf"),
    ]);
    clickSave();
    await waitFor(() =>
      expect(screen.getByText("Upload interrupted")).toBeTruthy(),
    );
    await waitFor(() => expect(screen.queryByText("second.pdf")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.upload.mock.calls.map(([file]) => file.name)).toEqual([
      "first.pdf",
      "second.pdf",
      "first.pdf",
    ]);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("retries list placement on the created bookmark without creating it again", async () => {
    mocks.addToList.mockRejectedValueOnce(new Error("List unavailable"));
    setup();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "list-1" },
    });
    await drop([makeFile("notes.txt", "text/plain", "Keep # literal")]);
    clickSave();
    await waitFor(() =>
      expect(screen.getByText("List unavailable")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.addToList).toHaveBeenNthCalledWith(2, {
      bookmarkId: "bookmark-1",
      listId: "list-1",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ format: "plain", text: "Keep # literal" }),
    );
  });

  it("keeps an invalid UTF-8 text file as an error instead of a success", async () => {
    setup();
    await drop([
      makeFile("invalid.txt", "text/plain", new Uint8Array([0xc3, 0x28])),
    ]);
    clickSave();
    await waitFor(() =>
      expect(
        screen.getByText(translations.editor.capture.invalid_utf8),
      ).toBeTruthy(),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects unsupported files and accepts a PDF with an empty MIME type", async () => {
    setup();
    await drop([
      makeFile(
        "slides.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
      makeFile("scan.pdf", ""),
      makeFile("captions.srt", "text/plain"),
    ]);
    expect(screen.getByRole("alert").textContent).toContain("slides.docx");
    expect(screen.getByText("scan.pdf")).toBeTruthy();
    expect(screen.queryByText("slides.docx")).toBeNull();
    expect(screen.queryByText("captions.srt")).toBeNull();
  });

  it("pastes an image into the pending queue without creating immediately", async () => {
    setup();
    const file = makeFile("clipboard.png", "image/png");
    fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: { files: [file], getData: () => "" },
    });
    expect(screen.getByText("clipboard.png")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("saves notes offline while preserving already staged files until reconnect", async () => {
    const view = setup();
    await drop([makeFile("later.pdf", "application/pdf")]);
    mocks.offline = true;
    view.rerender(
      <CaptureComposerProvider>
        <EditorCard />
      </CaptureComposerProvider>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Choose or drop files",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Offline note" },
    });
    clickSave();
    await waitFor(() => expect(mocks.offlineCreate).toHaveBeenCalledTimes(1));
    expect(screen.getByText("later.pdf")).toBeTruthy();
    expect(mocks.upload).not.toHaveBeenCalled();
    mocks.offline = false;
    view.rerender(
      <CaptureComposerProvider>
        <EditorCard />
      </CaptureComposerProvider>,
    );
    clickSave();
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("preserves drafts across composer unmounts and clears them when the account changes", async () => {
    const view = setup();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Keep my draft" },
    });
    await drop([makeFile("draft.pdf", "application/pdf")]);
    view.rerender(
      <CaptureComposerProvider>
        <span>Closed composer</span>
      </CaptureComposerProvider>,
    );
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    view.rerender(
      <CaptureComposerProvider>
        <EditorCard />
      </CaptureComposerProvider>,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Keep my draft",
    );
    expect(screen.getByText("draft.pdf")).toBeTruthy();
    mocks.userId = "user-2";
    view.rerender(
      <CaptureComposerProvider>
        <EditorCard />
      </CaptureComposerProvider>,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText("draft.pdf")).toBeNull();
  });

  it("retains only failed URLs from a partial multiline import", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Link unavailable"));
    setup();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "https://one.example\nhttps://two.example" },
    });
    clickSave();
    await waitFor(() =>
      expect(screen.getByText("Link unavailable")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.queryByText("https://two.example")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.create.mock.calls.map(([input]) => input.url)).toEqual([
      "https://one.example",
      "https://two.example",
      "https://one.example",
    ]);
  });

  it("cleans up an uploaded asset when bookmark creation fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Creation interrupted"));
    setup();
    await drop([makeFile("cleanup.pdf", "application/pdf")]);
    clickSave();
    await waitFor(() =>
      expect(screen.getByText("Creation interrupted")).toBeTruthy(),
    );
    expect(mocks.deleteAsset).toHaveBeenCalledWith({
      assetId: "asset-cleanup.pdf",
    });
    expect(screen.getByText("cleanup.pdf")).toBeTruthy();
  });

  it("finishes contextual tags after reconnect without recreating an offline note", async () => {
    mocks.offline = true;
    mocks.tagId = "tag-1";
    const view = setup();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Tagged offline note" },
    });
    clickSave();
    await waitFor(() =>
      expect(
        screen.getByText(translations.editor.capture.connect_tag),
      ).toBeTruthy(),
    );
    expect(mocks.offlineCreate).toHaveBeenCalledTimes(1);
    expect(mocks.tags).not.toHaveBeenCalled();
    mocks.offline = false;
    view.rerender(
      <CaptureComposerProvider>
        <EditorCard />
      </CaptureComposerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
    expect(mocks.offlineCreate).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.tags).toHaveBeenCalledWith({
      bookmarkId: expect.any(String),
      attach: [{ tagId: "tag-1" }],
      detach: [],
    });
  });
});
