// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import en from "@/lib/i18n/locales/en/translation.json";
import fr from "@/lib/i18n/locales/fr/translation.json";

const locale = vi.hoisted(() => ({ language: "fr" }));
vi.mock("@/lib/i18n/client", async () => ({
  useTranslation: (await import("react-i18next")).useTranslation,
}));
vi.mock("@/lib/userLocalSettings/userLocalSettings", () => ({
  getUserLocalSettings: async () => ({ lang: locale.language }),
}));
vi.mock("@/components/dashboard/header/Header", () => ({
  default: () => null,
}));
vi.mock("@/components/dashboard/ErrorFallback", () => ({
  default: () => null,
}));
vi.mock("@/components/DemoModeBanner", () => ({ default: () => null }));
vi.mock("@/components/utils/ValidAccountCheck", () => ({
  default: () => null,
}));
vi.mock("@karakeep/shared/config", () => ({ default: { demoMode: false } }));

afterEach(cleanup);

describe("translated loading announcements", () => {
  it.each([
    ["fr", fr.common.loading],
    ["de", en.common.loading],
  ])(
    "uses %s with English fallback in the full-page spinner",
    async (language, label) => {
      const i18n = createInstance();
      await i18n.use(initReactI18next).init({
        lng: language,
        fallbackLng: "en",
        resources: { en: { translation: en }, fr: { translation: fr } },
      });
      const { getByRole } = render(
        <I18nextProvider i18n={i18n}>
          <FullPageSpinner />
        </I18nextProvider>,
      );
      expect(getByRole("status", { name: label })).toBeTruthy();
    },
  );

  it.each([
    ["fr", fr.common.loading],
    ["de", en.common.loading],
  ])(
    "uses the server's %s locale with English fallback in the sidebar",
    async (language, label) => {
      locale.language = language;
      const pending = new Promise<void>(() => {
        // Keep the content suspended so the loading announcement is rendered.
      });
      function PendingContent(): React.ReactNode {
        throw pending;
      }
      const layout = await SidebarLayout({
        children: <PendingContent />,
        sidebar: null,
        mobileSidebar: null,
      });
      const { getByRole } = render(layout);
      expect(getByRole("status", { name: label })).toBeTruthy();
    },
  );
});
