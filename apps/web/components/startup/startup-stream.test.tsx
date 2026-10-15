import React from "react";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// This test uses the real root layout and delays its authentication provider.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-test" });
  return Object.fromEntries(
    [
      "Atkinson_Hyperlegible",
      "Cal_Sans",
      "Cantarell",
      "Charis_SIL",
      "Commissioner",
      "Fira_Sans",
      "Geist",
      "IBM_Plex_Sans",
      "IBM_Plex_Serif",
      "Inter",
      "Lato",
      "Literata",
      "Manrope",
      "Merriweather",
      "Mona_Sans",
      "Newsreader",
      "Nunito",
      "PT_Sans",
      "PT_Serif",
      "Source_Sans_3",
      "Source_Serif_4",
      "Stack_Sans_Text",
      "JetBrains_Mono",
    ].map((name) => [name, font]),
  );
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/lib/userLocalSettings/userLocalSettings", () => ({
  getUserLocalSettings: async () => ({ lang: "en" }),
}));
vi.mock("@/lib/i18n/server", () => ({
  useTranslation: async () => ({ t: (key: string) => key }),
}));
vi.mock("@/server/auth", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/lib/providers", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("nuqs/adapters/next/app", () => ({
  NuqsAdapter: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => null,
}));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@karakeep/shared/config", () => ({
  clientConfig: {},
  default: { publicUrl: "http://localhost:3000" },
}));

import RootLayout from "@/app/layout";
import { getServerAuthSession } from "@/server/auth";

describe("initial startup response", () => {
  it("streams branding and recovery before authentication resolves", async () => {
    let resolveSession!: (session: null) => void;
    vi.mocked(getServerAuthSession).mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const element = await RootLayout({
      children: <main>Usable destination</main>,
    });
    let output = "";
    let aborting = false;
    const errors: unknown[] = [];
    const sink = new PassThrough();
    sink.on("data", (chunk) => {
      output += chunk.toString();
    });
    let shellReady!: () => void;
    const shell = new Promise<void>((resolve) => {
      shellReady = resolve;
    });
    const stream = renderToPipeableStream(element, {
      onShellReady() {
        stream.pipe(sink);
        shellReady();
      },
      onError(error) {
        if (!aborting) errors.push(error);
      },
    });
    try {
      await shell;
      expect(output).toContain('class="marka-startup"');
      expect(output).toContain('role="status"');
      expect(output).toContain('id="marka-startup-retry"');
      expect(output).not.toContain("Usable destination");
      expect(output).toContain("setTimeout(recover, 15000)");
      expect(errors).toEqual([]);
    } finally {
      resolveSession(null);
      aborting = true;
      stream.abort();
      sink.destroy();
    }
  });
});
