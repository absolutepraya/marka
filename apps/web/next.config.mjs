import bundleAnalyzer from "@next/bundle-analyzer";
import { execSync } from "node:child_process";

// Fork versioning: keep SERVER_VERSION as the legacy full-commit alias while
// exposing the same commit through the explicit SERVER_COMMIT variable.
if (!process.env.SERVER_COMMIT && !process.env.SERVER_VERSION) {
  try {
    process.env.SERVER_COMMIT = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // No git in this environment (e.g. inside the Docker build); keep whatever
    // SERVER_VERSION the build arg provided.
  }
}

if (
  !process.env.SERVER_COMMIT &&
  /^[0-9a-f]{7,40}$/i.test(process.env.SERVER_VERSION ?? "")
) {
  process.env.SERVER_COMMIT = process.env.SERVER_VERSION;
}
if (!process.env.SERVER_VERSION && process.env.SERVER_COMMIT) {
  process.env.SERVER_VERSION = process.env.SERVER_COMMIT;
}

const serviceWorkerBuildVersion = (
  process.env.SERVER_COMMIT ??
  process.env.SERVER_VERSION ??
  "development"
).toLowerCase();

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_SERVICE_WORKER_BUILD_VERSION: serviceWorkerBuildVersion,
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  async headers() {
    return [
      {
        // Routes this applies to
        source: "/api/(.*)",
        // Headers
        headers: [
          // Allow for specific domains to have access or * for all
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          // Allows for specific methods accepted
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          // Allows for specific headers accepted (These are a few standard ones)
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
    ];
  },

  // transpilePackages: ["@karakeep/shared", "@karakeep/db", "@karakeep/trpc"],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(","),
};

export default withBundleAnalyzer(nextConfig);
