import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { LIBRARY_STORE_SECRET: "test-secret" } },
    }),
  ],
  test: {
    deps: {
      optimizer: {
        // CommonJS dependencies of the shared schema need pre-bundling to
        // load in workerd under Vitest; Wrangler bundles them for deploys.
        ssr: { enabled: true, include: ["@paralleldrive/cuid2"] },
      },
    },
  },
});
