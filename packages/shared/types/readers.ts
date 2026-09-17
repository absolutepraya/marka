import { z } from "zod";

import { ZReaderFontFamily, zReaderFontFamilySchema } from "./users";

export const READER_DEFAULTS = {
  fontSize: 18,
  lineHeight: 1.6,
  fontFamily: "literata" as const,
} as const;

export const READER_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: "Georgia, Cambria, 'Times New Roman', serif",
  sans: "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-jetbrains-mono), ui-monospace, Menlo, Monaco, monospace",
  literata: "var(--font-reader-literata), Literata, Georgia, serif",
  "source-serif-4":
    "var(--font-reader-source-serif-4), 'Source Serif 4', Georgia, serif",
  newsreader: "var(--font-reader-newsreader), Newsreader, Georgia, serif",
  merriweather: "var(--font-reader-merriweather), Merriweather, Georgia, serif",
  "ibm-plex-serif":
    "var(--font-reader-ibm-plex-serif), 'IBM Plex Serif', Georgia, serif",
  "pt-serif": "var(--font-reader-pt-serif), 'PT Serif', Georgia, serif",
  "charis-sil": "var(--font-reader-charis-sil), 'Charis SIL', Georgia, serif",
  nunito: "var(--font-reader-nunito), Nunito, ui-sans-serif, sans-serif",
  lato: "var(--font-reader-lato), Lato, ui-sans-serif, sans-serif",
  inter: "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif",
  manrope: "var(--font-reader-manrope), Manrope, ui-sans-serif, sans-serif",
  geist: "var(--font-reader-geist), Geist, ui-sans-serif, sans-serif",
  "mona-sans":
    "var(--font-reader-mona-sans), 'Mona Sans', ui-sans-serif, sans-serif",
  "fira-sans":
    "var(--font-reader-fira-sans), 'Fira Sans', ui-sans-serif, sans-serif",
  "pt-sans": "var(--font-reader-pt-sans), 'PT Sans', ui-sans-serif, sans-serif",
  cantarell:
    "var(--font-reader-cantarell), Cantarell, ui-sans-serif, sans-serif",
  commissioner:
    "var(--font-reader-commissioner), Commissioner, ui-sans-serif, sans-serif",
  "stack-sans":
    "var(--font-reader-stack-sans), 'Stack Sans Text', ui-sans-serif, sans-serif",
  "cal-sans":
    "var(--font-reader-cal-sans), 'Cal Sans', ui-sans-serif, sans-serif",
  "atkinson-hyperlegible":
    "var(--font-reader-atkinson-hyperlegible), 'Atkinson Hyperlegible', ui-sans-serif, sans-serif",
  "source-sans-3":
    "var(--font-reader-source-sans-3), 'Source Sans 3', ui-sans-serif, sans-serif",
  "ibm-plex-sans":
    "var(--font-reader-ibm-plex-sans), 'IBM Plex Sans', ui-sans-serif, sans-serif",
} as const;

export const READER_FONT_OPTIONS: readonly {
  value: ZReaderFontFamily;
  label: string;
}[] = [
  { value: "literata", label: "Literata" },
  { value: "source-serif-4", label: "Source Serif 4" },
  { value: "newsreader", label: "Newsreader" },
  { value: "merriweather", label: "Merriweather" },
  { value: "ibm-plex-serif", label: "IBM Plex Serif" },
  { value: "pt-serif", label: "PT Serif" },
  { value: "charis-sil", label: "Charis SIL" },
  { value: "nunito", label: "Nunito" },
  { value: "lato", label: "Lato" },
  { value: "inter", label: "Inter" },
  { value: "manrope", label: "Manrope" },
  { value: "geist", label: "Geist" },
  { value: "mona-sans", label: "Mona Sans" },
  { value: "fira-sans", label: "Fira Sans" },
  { value: "pt-sans", label: "PT Sans" },
  { value: "cantarell", label: "Cantarell" },
  { value: "commissioner", label: "Commissioner" },
  { value: "stack-sans", label: "Stack Sans Text" },
  { value: "cal-sans", label: "Cal Sans" },
  { value: "atkinson-hyperlegible", label: "Atkinson Hyperlegible" },
  { value: "source-sans-3", label: "Source Sans 3" },
  { value: "ibm-plex-sans", label: "IBM Plex Sans" },
  { value: "serif", label: "Georgia" },
  { value: "sans", label: "System UI" },
  { value: "mono", label: "JetBrains Mono" },
] as const;

// Setting constraints for UI controls
export const READER_SETTING_CONSTRAINTS = {
  fontSize: { min: 12, max: 24, step: 1 },
  lineHeight: { min: 1.2, max: 2.5, step: 0.1 },
} as const;

// Formatting functions for display
export function formatFontSize(value: number): string {
  return `${value}px`;
}

export function formatLineHeight(value: number): string {
  return value.toFixed(1);
}

export function formatFontFamily(value: ZReaderFontFamily): string {
  return (
    READER_FONT_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

export const zReaderSettings = z.object({
  fontSize: z.number().int().min(12).max(24),
  lineHeight: z.number().min(1.2).max(2.5),
  fontFamily: zReaderFontFamilySchema,
});

export type ReaderSettings = z.infer<typeof zReaderSettings>;

export const zReaderSettingsPartial = zReaderSettings.partial();
export type ReaderSettingsPartial = z.infer<typeof zReaderSettingsPartial>;
