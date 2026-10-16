import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  inspectPublicMarkup,
  verifyPublicSite,
} from "./verify-public-site.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const staleBrandingFixture = await readFile(
  resolve(scriptDirectory, "fixtures/stale-branding.html"),
  "utf8",
);

const sourceIds = [
  "movies",
  "wishlist",
  "places",
  "career",
  "engineering",
  "ui-reference",
  "course-material",
];
const desktopDemoIds = [
  "save-from-anywhere",
  "keep-the-context",
  "rediscover-it",
];
const allDemoIds = [...desktopDemoIds, "mobile-library"];
const localOrigin = "http://localhost:4321/";

async function createPublicSite(
  t,
  { pending = false, origin = localOrigin } = {},
) {
  const tempRoot = await mkdtemp(join(tmpdir(), "marka-public-site-"));
  const distDir = join(tempRoot, "dist");
  const canonicalUrl = new URL("/", origin).href;
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const assetPaths = [
    "brand/marka/marka-social.png",
    "brand/marka/marka-icon.png",
    "brand/marka/marka-apple-touch-icon.png",
    "brand/marka/marka-wordmark-navy.png",
    ...sourceIds.map((id) => `marketing/source-cards/${id}.webp`),
    ...allDemoIds.map((id) => `marketing/posters/${id}.webp`),
  ];

  if (!pending) {
    assetPaths.push(
      "marketing/previews/marka-desktop-library.webp",
      ...allDemoIds.map((id) => `marketing/demos/${id}.mp4`),
    );
  }

  for (const assetPath of assetPaths) {
    const absolutePath = join(distDir, assetPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "fixture asset");
  }

  const productPreview = pending
    ? '<div class="product-canvas__artwork" role="img" aria-label="Original illustrations, not product screen captures"></div>'
    : '<img src="/marketing/previews/marka-desktop-library.webp" alt="A full Marka library with saved items and tags">';
  const sourceCards = sourceIds
    .map(
      (id) =>
        `<article data-source-card="${id}"><img src="/marketing/source-cards/${id}.webp" alt="Illustration for ${id}"></article>`,
    )
    .join("");
  const desktopDemos = desktopDemoIds
    .map((id) =>
      pending
        ? `<article data-demo-card="${id}"><img src="/marketing/posters/${id}.webp" alt="Illustration placeholder"><p>Recording pending review</p></article>`
        : `<article data-demo-card="${id}"><video src="/marketing/demos/${id}.mp4" poster="/marketing/posters/${id}.webp" muted playsinline preload="metadata"></video><button aria-label="Play ${id} demo">Play</button></article>`,
    )
    .join("");
  const mobileDemo = pending
    ? '<div data-mobile-demo="mobile-library" data-mobile-demo-status="pending"><img src="/marketing/posters/mobile-library.webp" alt="Illustrative mobile library poster"></div><p>Recording pending review</p>'
    : '<div data-mobile-demo="mobile-library" data-mobile-demo-status="ready"><video src="/marketing/demos/mobile-library.mp4" poster="/marketing/posters/mobile-library.webp" muted loop playsinline preload="metadata"></video></div>';
  const localPreview = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    new URL(origin).hostname,
  );
  const robots = localPreview ? "noindex, nofollow" : "index, follow";
  const html = `<!doctype html><html lang="en"><head>
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="icon" href="/brand/marka/marka-icon.png">
<link rel="apple-touch-icon" href="/brand/marka/marka-apple-touch-icon.png">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${new URL("/brand/marka/marka-social.png", origin).href}">
<meta name="twitter:image" content="${new URL("/brand/marka/marka-social.png", origin).href}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", url: canonicalUrl })}</script>
</head><body><img src="/brand/marka/marka-wordmark-navy.png" alt="Marka">
<section class="product-canvas">${productPreview}</section>
<section id="library">${sourceCards}</section>
<section id="demos">${desktopDemos}</section>
<section data-page-section="mobile-library">${mobileDemo}</section>
</body></html>`;

  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, "index.html"), html);
  await writeFile(
    join(distDir, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", origin).href}\n`,
  );
  await writeFile(
    join(distDir, "sitemap.xml"),
    `<?xml version="1.0"?><urlset><url><loc>${canonicalUrl}</loc></url></urlset>`,
  );

  return { distDir, html };
}

test("rejects inherited product names and public links", () => {
  assert.throws(() => inspectPublicMarkup(staleBrandingFixture), /karakeep/i);
  assert.throws(
    () =>
      inspectPublicMarkup(
        '<a href="https://cloud.karakeep.app">cloud service</a>',
      ),
    /karakeep/i,
  );
  assert.throws(
    () =>
      inspectPublicMarkup('<a href="https://apps.apple.com/app/marka">app</a>'),
    /apps\.apple\.com/i,
  );
});

test("accepts the complete local preview output", async (t) => {
  const { distDir } = await createPublicSite(t);
  const result = await verifyPublicSite({ distDir });

  assert.equal(result.origin, localOrigin);
  assert.equal(result.sourceCards, sourceIds.length);
  assert.equal(result.desktopDemos, desktopDemoIds.length);
  assert.equal(result.videos, allDemoIds.length);
});

test("accepts clearly pending capture assets in a local preview", async (t) => {
  const { distDir } = await createPublicSite(t, { pending: true });
  const result = await verifyPublicSite({ distDir });

  assert.equal(result.videos, 0);
  assert.equal(result.pendingDemos, allDemoIds.length);
});

test("rejects a missing social image", async (t) => {
  const { distDir } = await createPublicSite(t);
  await rm(join(distDir, "brand/marka/marka-social.png"));

  await assert.rejects(
    verifyPublicSite({ distDir }),
    /missing social image target/i,
  );
});

test("rejects a remote media URL", async (t) => {
  const { distDir, html } = await createPublicSite(t);
  await writeFile(
    join(distDir, "index.html"),
    html.replace(
      'src="/marketing/source-cards/movies.webp"',
      'src="https://cdn.example.test/movies.webp"',
    ),
  );

  await assert.rejects(verifyPublicSite({ distDir }), /non-local media/i);
});

test("rejects a local media path with no built target", async (t) => {
  const { distDir, html } = await createPublicSite(t);
  await writeFile(
    join(distDir, "index.html"),
    html.replace(
      'src="/marketing/source-cards/movies.webp"',
      'src="/marketing/source-cards/missing.webp"',
    ),
  );

  await assert.rejects(verifyPublicSite({ distDir }), /missing local media/i);
});

test("rejects a canonical URL that differs from the intentional site origin", async (t) => {
  const { distDir, html } = await createPublicSite(t);
  await writeFile(
    join(distDir, "index.html"),
    html.replace(
      '<link rel="canonical" href="http://localhost:4321/">',
      '<link rel="canonical" href="https://wrong.example/">',
    ),
  );

  await assert.rejects(
    verifyPublicSite({ distDir }),
    /canonical.*expected origin/i,
  );
});

test("requires an explicit site origin for a release artifact", async (t) => {
  const { distDir } = await createPublicSite(t);

  await assert.rejects(
    verifyPublicSite({ distDir, release: true }),
    /MARKA_LANDING_SITE_ORIGIN/i,
  );
});

test("refuses pending screenshots and recordings in a release artifact", async (t) => {
  const origin = "https://marka.example/";
  const { distDir } = await createPublicSite(t, { pending: true, origin });

  await assert.rejects(
    verifyPublicSite({ distDir, siteOrigin: origin, release: true }),
    /approved product preview/i,
  );
});

test("requires the mobile recording even when the static poster is server-rendered", async (t) => {
  const { distDir, html } = await createPublicSite(t);
  const withVideo =
    '<div data-mobile-demo="mobile-library" data-mobile-demo-status="ready"><video src="/marketing/demos/mobile-library.mp4" poster="/marketing/posters/mobile-library.webp" muted loop playsinline preload="metadata"></video></div>';
  const withPoster =
    '<div data-mobile-demo="mobile-library" data-mobile-demo-status="ready"><img src="/marketing/posters/mobile-library.webp" alt="Mobile library poster"></div>';

  await writeFile(
    join(distDir, "index.html"),
    html.replace(withVideo, withPoster),
  );
  await rm(join(distDir, "marketing/demos/mobile-library.mp4"));

  await assert.rejects(
    verifyPublicSite({ distDir }),
    /missing local mobile library recording/i,
  );
});
