// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZImportSessionWithStats } from "@karakeep/shared/types/importSessions";
import ImportSessionDetail from "./ImportSessionDetail";
import { ImportSessionCard } from "./ImportSessionCard";

const state = vi.hoisted(() => ({
  stats: undefined as unknown,
  loading: false,
  resultsLoading: false,
  pause: vi.fn(),
  resume: vi.fn(),
  pausePending: false,
  results: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));
vi.mock("@/lib/hooks/useImportSessions", () => ({
  useImportSessionStats: () => ({
    data: state.stats,
    isLoading: state.loading,
  }),
  useImportSessionResults: (id: string, filter: string) => {
    state.results(id, filter);
    return {
      data: { pages: [{ items: [] }] },
      isLoading: state.resultsLoading,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    };
  },
  useDeleteImportSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFinalizeImportStaging: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePauseImportSession: () => ({
    mutate: state.pause,
    isPending: state.pausePending,
  }),
  useResumeImportSession: () => ({ mutate: state.resume, isPending: false }),
}));
const session: ZImportSessionWithStats = {
  id: "session-1",
  userId: "u1",
  name: "Reading collection",
  status: "completed",
  createdAt: new Date("2000-01-01"),
  modifiedAt: null,
  rootListId: null,
  message: null,
  totalBookmarks: 100,
  completedBookmarks: 60,
  failedBookmarks: 10,
  pendingBookmarks: 20,
  processingBookmarks: 10,
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  state.stats = session;
  state.loading = false;
  state.resultsLoading = false;
  state.pausePending = false;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("import loading and live actions", () => {
  it("uses a full-detail capture until statistics arrive", () => {
    state.loading = true;
    state.stats = undefined;
    const view = render(<ImportSessionDetail sessionId="session-1" />);
    expect(
      view.container.querySelector('[data-content-skeleton="import-detail"]'),
    ).toBeTruthy();
    state.loading = false;
    state.stats = session;
    view.rerender(<ImportSessionDetail sessionId="session-1" />);
    expect(view.getByText("Reading collection")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
  });
  it("keeps progress visible while filtered result rows load", () => {
    state.resultsLoading = true;
    const view = render(<ImportSessionDetail sessionId="session-1" />);
    expect(view.getByText("70 of 100 processed")).toBeTruthy();
    expect(
      view.container.querySelector('[data-content-skeleton="import-results"]'),
    ).toBeTruthy();
    fireEvent.mouseDown(
      view.getByRole("tab", {
        name: "settings.import_sessions.detail.filter_accepted",
      }),
      { button: 0, ctrlKey: false },
    );
    expect(state.results).toHaveBeenLastCalledWith("session-1", "accepted");
    state.resultsLoading = false;
    view.rerender(<ImportSessionDetail sessionId="session-1" />);
    expect(
      view.getByText("settings.import_sessions.detail.no_results"),
    ).toBeTruthy();
  });
  it("uses live card statistics and preserves pause/resume payloads and pending guards", () => {
    state.stats = { ...session, status: "running" };
    const view = render(<ImportSessionCard session={session} />);
    fireEvent.click(
      view.getByRole("button", {
        name: "settings.import_sessions.pause_session",
      }),
    );
    expect(state.pause).toHaveBeenCalledWith({ importSessionId: "session-1" });
    state.pausePending = true;
    view.rerender(<ImportSessionCard session={session} />);
    expect(
      (
        view.getByRole("button", {
          name: "settings.import_sessions.pause_session",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    state.stats = { ...session, status: "paused" };
    view.rerender(<ImportSessionCard session={session} />);
    fireEvent.click(
      view.getByRole("button", {
        name: "settings.import_sessions.resume_session",
      }),
    );
    expect(state.resume).toHaveBeenCalledWith({ importSessionId: "session-1" });
  });
});
