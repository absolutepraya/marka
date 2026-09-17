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

// Font families for WebView HTML content (CSS font stacks). Keep this map
// complete so a server-synced setting never results in an undefined CSS value.
const WEBVIEW_SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const WEBVIEW_SANS_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const WEBVIEW_MONO_FALLBACK =
  "ui-monospace, Menlo, Monaco, 'Courier New', monospace";

export const WEBVIEW_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: WEBVIEW_SERIF_FALLBACK,
  sans: WEBVIEW_SANS_FALLBACK,
  mono: WEBVIEW_MONO_FALLBACK,
  literata: `Literata, ${WEBVIEW_SERIF_FALLBACK}`,
  "source-serif-4": `'Source Serif 4', ${WEBVIEW_SERIF_FALLBACK}`,
  newsreader: `Newsreader, ${WEBVIEW_SERIF_FALLBACK}`,
  merriweather: `Merriweather, ${WEBVIEW_SERIF_FALLBACK}`,
  "ibm-plex-serif": `'IBM Plex Serif', ${WEBVIEW_SERIF_FALLBACK}`,
  "pt-serif": `'PT Serif', ${WEBVIEW_SERIF_FALLBACK}`,
  "charis-sil": `'Charis SIL', ${WEBVIEW_SERIF_FALLBACK}`,
  nunito: `Nunito, ${WEBVIEW_SANS_FALLBACK}`,
  lato: `Lato, ${WEBVIEW_SANS_FALLBACK}`,
  inter: `Inter, ${WEBVIEW_SANS_FALLBACK}`,
  manrope: `Manrope, ${WEBVIEW_SANS_FALLBACK}`,
  geist: `Geist, ${WEBVIEW_SANS_FALLBACK}`,
  "mona-sans": `'Mona Sans', ${WEBVIEW_SANS_FALLBACK}`,
  "fira-sans": `'Fira Sans', ${WEBVIEW_SANS_FALLBACK}`,
  "pt-sans": `'PT Sans', ${WEBVIEW_SANS_FALLBACK}`,
  cantarell: `Cantarell, ${WEBVIEW_SANS_FALLBACK}`,
  commissioner: `Commissioner, ${WEBVIEW_SANS_FALLBACK}`,
  "stack-sans": `'Stack Sans Text', ${WEBVIEW_SANS_FALLBACK}`,
  "cal-sans": `'Cal Sans', ${WEBVIEW_SANS_FALLBACK}`,
  "atkinson-hyperlegible": `'Atkinson Hyperlegible', ${WEBVIEW_SANS_FALLBACK}`,
  "source-sans-3": `'Source Sans 3', ${WEBVIEW_SANS_FALLBACK}`,
  "ibm-plex-sans": `'IBM Plex Sans', ${WEBVIEW_SANS_FALLBACK}`,
} as const;

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
