import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  Cal_Sans,
  Cantarell,
  Charis_SIL,
  Commissioner,
  Fira_Sans,
  Geist,
  IBM_Plex_Sans,
  IBM_Plex_Serif,
  Inter,
  Lato,
  Literata,
  Manrope,
  Merriweather,
  Mona_Sans,
  Newsreader,
  Nunito,
  PT_Sans,
  PT_Serif,
  Source_Sans_3,
  Source_Serif_4,
  Stack_Sans_Text,
  JetBrains_Mono,
} from "next/font/google";
import Script from "next/script";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import "./globals.css";
import "@fontsource/noto-color-emoji/emoji.css";
import "streamdown/styles.css";

import type { Viewport } from "next";
import { headers } from "next/headers";
import React from "react";
import { MARKA } from "@/lib/brand";
import Providers from "@/lib/providers";
import { getUserLocalSettings } from "@/lib/userLocalSettings/userLocalSettings";
import { getServerAuthSession } from "@/server/auth";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";

import { clientConfig } from "@karakeep/shared/config";

// Inter + JetBrains Mono are variable fonts, so we load the full weight range
// (no `weight` needed). Theme preset fonts; emoji stays in the fallback chain.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  fallback: [
    "Apple Color Emoji",
    "Noto Color Emoji",
    "system-ui",
    "sans-serif",
  ],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  fallback: [
    "Apple Color Emoji",
    "Noto Color Emoji",
    "ui-monospace",
    "monospace",
  ],
});

const readerNunito = Nunito({
  subsets: ["latin"],
  variable: "--font-reader-nunito",
  display: "swap",
  preload: false,
});

const readerLato = Lato({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-lato",
  display: "swap",
  preload: false,
});

const readerCalSans = Cal_Sans({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-reader-cal-sans",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const readerMonaSans = Mona_Sans({
  subsets: ["latin"],
  variable: "--font-reader-mona-sans",
  display: "swap",
  preload: false,
});

const readerGeist = Geist({
  subsets: ["latin"],
  variable: "--font-reader-geist",
  display: "swap",
  preload: false,
});

const readerManrope = Manrope({
  subsets: ["latin"],
  variable: "--font-reader-manrope",
  display: "swap",
  preload: false,
});

const readerStackSans = Stack_Sans_Text({
  subsets: ["latin"],
  variable: "--font-reader-stack-sans",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

const readerIbmPlexSerif = IBM_Plex_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-ibm-plex-serif",
  display: "swap",
  preload: false,
});

const readerFiraSans = Fira_Sans({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-fira-sans",
  display: "swap",
  preload: false,
});

const readerPtSerif = PT_Serif({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-pt-serif",
  display: "swap",
  preload: false,
});

const readerCharisSil = Charis_SIL({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-charis-sil",
  display: "swap",
  preload: false,
});

const readerCommissioner = Commissioner({
  subsets: ["latin"],
  variable: "--font-reader-commissioner",
  display: "swap",
  preload: false,
});

const readerCantarell = Cantarell({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-cantarell",
  display: "swap",
  preload: false,
});

const readerPtSans = PT_Sans({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-pt-sans",
  display: "swap",
  preload: false,
});

const readerLiterata = Literata({
  subsets: ["latin"],
  variable: "--font-reader-literata",
  display: "swap",
  preload: false,
});

const readerSourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-reader-source-serif-4",
  display: "swap",
  preload: false,
});

const readerNewsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-reader-newsreader",
  display: "swap",
  preload: false,
});

const readerMerriweather = Merriweather({
  subsets: ["latin"],
  variable: "--font-reader-merriweather",
  display: "swap",
  preload: false,
});

const readerAtkinsonHyperlegible = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-reader-atkinson-hyperlegible",
  display: "swap",
  preload: false,
});

const readerSourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-reader-source-sans-3",
  display: "swap",
  preload: false,
});

const readerIbmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-reader-ibm-plex-sans",
  display: "swap",
  preload: false,
});

const readerFontVariables = [
  readerNunito,
  readerLato,
  readerCalSans,
  readerMonaSans,
  readerGeist,
  readerManrope,
  readerStackSans,
  readerIbmPlexSerif,
  readerFiraSans,
  readerPtSerif,
  readerCharisSil,
  readerCommissioner,
  readerCantarell,
  readerPtSans,
  readerLiterata,
  readerSourceSerif,
  readerNewsreader,
  readerMerriweather,
  readerAtkinsonHyperlegible,
  readerSourceSans,
  readerIbmPlexSans,
]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  title: MARKA.name,
  applicationName: MARKA.name,
  description: MARKA.description,
  appleWebApp: {
    capable: true,
    title: MARKA.name,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    // Theme-aware favicon tracks the OS/browser color scheme.
    icon: [
      {
        url: MARKA.icon.light,
        media: "(prefers-color-scheme: light)",
        type: "image/png",
      },
      {
        url: MARKA.icon.dark,
        media: "(prefers-color-scheme: dark)",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: MARKA.icon.apple,
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  const userSettings = await getUserLocalSettings();
  const isRTL = userSettings.lang === "ar";
  // Coarse phone detection so the masonry grid can server-render the right
  // column count on the first paint (phones get <=2 cols) instead of flashing
  // down from the desktop default after hydration. The client still measures
  // the real viewport, so this is only a first-paint hint.
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isMobile = /Mobi/i.test(userAgent);
  return (
    <html
      lang={userSettings.lang}
      dir={isRTL ? "rtl" : "ltr"}
      className={`${inter.variable} ${jetbrainsMono.variable} ${readerFontVariables}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <NuqsAdapter>
          <Providers
            session={session}
            clientConfig={clientConfig}
            userLocalSettings={userSettings}
            isMobile={isMobile}
          >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
          </Providers>
          <Toaster className="mobile-nav-toast-offset" />
        </NuqsAdapter>
        {process.env.NODE_ENV === "development" && (
          <Script
            // React Grab inspects and annotates the DOM. Loading it after the
            // browser is idle keeps it out of React's hydration window,
            // particularly on slower mobile devices.
            src="https://unpkg.com/react-grab@0.1.48/dist/index.global.js"
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
        )}
      </body>
    </html>
  );
}
