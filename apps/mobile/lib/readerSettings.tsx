import { ReactNode, useCallback } from "react";
import { Platform } from "react-native";

import {
  ReaderSettingsProvider as BaseReaderSettingsProvider,
  useReaderSettingsContext,
} from "@karakeep/shared-react/hooks/reader-settings";
import { ReaderSettingsPartial } from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

import { useSettings } from "./settings";

// Mobile-specific font families for native Text components
// On Android, use generic font family names: "serif", "sans-serif", "monospace"
// On iOS, use specific font names like "Georgia" and "Courier"
// Note: undefined means use the system default font
export const MOBILE_FONT_FAMILIES: Partial<
  Record<ZReaderFontFamily, string | undefined>
> = Platform.select({
  android: {
    serif: "serif",
    sans: undefined,
    mono: "monospace",
  },
  default: {
    serif: "Georgia",
    sans: undefined,
    mono: "Courier",
  },
})!;

// Mobile WebViews intentionally render the three families supported by the
// native settings UI. Server-synced web font choices are reduced to their
// semantic family because those fonts are not bundled in the mobile app.
const WEBVIEW_FONT_FAMILIES = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, Menlo, Monaco, 'Courier New', monospace",
} as const;

const MOBILE_SERIF_FAMILIES: ReadonlySet<ZReaderFontFamily> = new Set([
  "serif",
  "literata",
  "source-serif-4",
  "newsreader",
  "merriweather",
  "ibm-plex-serif",
  "pt-serif",
  "charis-sil",
]);

export function getWebViewFontFamily(fontFamily: ZReaderFontFamily): string {
  if (fontFamily === "mono") return WEBVIEW_FONT_FAMILIES.mono;
  if (MOBILE_SERIF_FAMILIES.has(fontFamily)) {
    return WEBVIEW_FONT_FAMILIES.serif;
  }
  return WEBVIEW_FONT_FAMILIES.sans;
}

/**
 * Mobile-specific provider for reader settings.
 * Wraps the shared provider with mobile storage callbacks.
 */
export function ReaderSettingsProvider({ children }: { children: ReactNode }) {
  // Read from zustand store directly to keep callback stable (empty deps).
  const getLocalOverrides = useCallback((): ReaderSettingsPartial => {
    const currentSettings = useSettings.getState().settings.settings;
    return {
      fontSize: currentSettings.readerFontSize,
      lineHeight: currentSettings.readerLineHeight,
      fontFamily: currentSettings.readerFontFamily,
    };
  }, []);

  const saveLocalOverrides = useCallback((overrides: ReaderSettingsPartial) => {
    const currentSettings = useSettings.getState().settings.settings;
    // Remove reader settings keys first, then add back only defined ones
    const {
      readerFontSize: _fs,
      readerLineHeight: _lh,
      readerFontFamily: _ff,
      ...rest
    } = currentSettings;

    const newSettings = { ...rest };
    if (overrides.fontSize !== undefined) {
      (newSettings as typeof currentSettings).readerFontSize =
        overrides.fontSize;
    }
    if (overrides.lineHeight !== undefined) {
      (newSettings as typeof currentSettings).readerLineHeight =
        overrides.lineHeight;
    }
    if (overrides.fontFamily !== undefined) {
      (newSettings as typeof currentSettings).readerFontFamily =
        overrides.fontFamily;
    }

    useSettings.getState().setSettings(newSettings);
  }, []);

  return (
    <BaseReaderSettingsProvider
      getLocalOverrides={getLocalOverrides}
      saveLocalOverrides={saveLocalOverrides}
    >
      {children}
    </BaseReaderSettingsProvider>
  );
}

// Re-export the context hook as useReaderSettings for mobile consumers
export { useReaderSettingsContext as useReaderSettings };
