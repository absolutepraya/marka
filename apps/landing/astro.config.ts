import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { LOCAL_PREVIEW_ORIGIN } from "./src/constants";

export default defineConfig({
  site: process.env.MARKA_LANDING_SITE_ORIGIN ?? LOCAL_PREVIEW_ORIGIN,
  integrations: [react()],
  vite: {
    plugins: [(await import("vite-plugin-svgr")).default()],
  },
});
