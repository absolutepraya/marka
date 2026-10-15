import assert from "node:assert/strict";
import { createRequire } from "node:module";
import sharp from "sharp";

const requireWeb = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const { load } = requireWeb("cheerio");
const base = new URL(process.argv[2] ?? "http://localhost:3000");
const paths = process.argv.slice(3);
if (paths.length === 0) {
  paths.push(
    "/signin",
    "/",
    "/signup",
    "/dashboard/bookmarks",
    "/dashboard/lists/unfurl-smoke-test",
    "/dashboard/tags/unfurl-smoke-test",
    "/settings",
    "/public/lists/unfurl-smoke-test",
  );
}

for (const userAgent of [
  "WhatsApp/2.24",
  "Twitterbot/1.0",
  "facebookexternalhit/1.1",
]) {
  for (const path of paths) {
    let url = new URL(path, base);
    let html;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(30_000),
      });
      assert(
        response.ok || response.status === 404,
        `${path}: HTTP ${response.status}`,
      );
      url = new URL(response.url);
      assert.equal(
        url.origin,
        base.origin,
        `${path}: unexpected cross-origin redirect`,
      );
      html = load(await response.text());
      // Some preview clients do not follow HTML refreshes. The initial page
      // must retain its shared image even while redirecting to sign-in.
      for (const [attribute, key] of [
        ["property", "og:image"],
        ["name", "twitter:image"],
      ]) {
        assert(
          html(`head meta[${attribute}="${key}"]`).attr("content"),
          `${path}: missing initial ${key} (${userAgent})`,
        );
        assert.equal(
          html(`head meta[${attribute}="${key}"]`).attr("content"),
          new URL("/brand/marka/marka-social.png", base).href,
          `${path}: incorrect initial ${key} (${userAgent})`,
        );
      }
      const refresh = html('meta[http-equiv="refresh"]').attr("content");
      if (!refresh) break;
      const destination = refresh.match(/url=(.*)$/i)?.[1];
      assert(destination, `${path}: invalid refresh redirect`);
      url = new URL(destination, url);
      assert.equal(
        url.origin,
        base.origin,
        `${path}: unexpected refresh destination`,
      );
      html = undefined;
    }
    assert(html, `${path}: too many redirects`);
    for (const [attribute, key] of [
      ["property", "og:image"],
      ["name", "twitter:image"],
    ]) {
      const imageUrl = html(`head meta[${attribute}="${key}"]`).attr("content");
      assert(
        imageUrl,
        `${path}: missing ${key} in document head (${userAgent})`,
      );
      const image = new URL(imageUrl);
      assert.equal(
        image.origin,
        base.origin,
        `${path}: image must belong to this instance`,
      );
      assert.equal(image.pathname, "/brand/marka/marka-social.png");
      const response = await fetch(image, {
        signal: AbortSignal.timeout(10_000),
      });
      assert(response.ok, `${path}: preview image HTTP ${response.status}`);
      assert.match(response.headers.get("content-type") ?? "", /^image\/png/);
      const metadata = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      assert.equal(metadata.width, 1200);
      assert.equal(metadata.height, 630);
    }
    assert.equal(
      html('head meta[property="og:site_name"]').attr("content"),
      "Marka",
    );
    assert.equal(
      html('head meta[name="twitter:card"]').attr("content"),
      "summary_large_image",
    );
    console.log(`PASS ${userAgent} ${path} -> ${url.pathname}`);
  }
}
