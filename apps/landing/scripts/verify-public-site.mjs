import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDistDirectory = resolve(scriptDirectory, "../dist");
const localPreviewOrigin = "http://localhost:4321/";
const sourceCardIds = [
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
const socialImagePath = "/brand/marka/marka-social.png";
const previewImagePath = "/marketing/previews/marka-desktop-library.webp";
const pendingLabel = "Recording pending review";
const forbiddenReferences = [
  "karakeep",
  "localhost labs",
  "localhostlabs.co.uk",
  "cloud.karakeep.app",
  "try.karakeep.app",
  "apps.apple.com",
  "play.google.com",
];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

export function inspectPublicMarkup(markup, filePath = "<markup>") {
  const normalizedMarkup = markup.toLowerCase();
  const match = forbiddenReferences.find((reference) =>
    normalizedMarkup.includes(reference),
  );

  if (match) {
    throw new Error(`Forbidden public reference "${match}" in ${filePath}`);
  }
}

function parseAttributes(tag) {
  const attributeText = tag
    .replace(/^<\s*[^\s/>]+/, "")
    .replace(/\/?>\s*$/, "");
  const attributes = new Map();
  const attributePattern =
    /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of attributeText.matchAll(attributePattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function findTags(markup, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return [...markup.matchAll(pattern)].map((match) => match[0]);
}

function findElementBlock(markup, tagName, attributeName, value) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  for (const match of markup.matchAll(pattern)) {
    const openTag = match[0];
    if (parseAttributes(openTag).get(attributeName) !== value) continue;

    const start = match.index ?? 0;
    const closeTag = `</${tagName}>`;
    const closeStart = markup.indexOf(closeTag, start + openTag.length);
    if (closeStart < 0) {
      throw new Error(`Unclosed <${tagName}> for ${attributeName}="${value}"`);
    }
    return markup.slice(start, closeStart + closeTag.length);
  }

  return undefined;
}

function getSingleAttributeValue(markup, tagName, attributeName, matches) {
  const tags = findTags(markup, tagName).filter((tag) =>
    matches(parseAttributes(tag)),
  );
  if (tags.length !== 1) {
    throw new Error(
      `Expected one <${tagName}> with ${attributeName}, found ${tags.length}`,
    );
  }
  return parseAttributes(tags[0]).get(attributeName);
}

function isLocalHost(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname.toLowerCase(),
  );
}

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid MARKA_LANDING_SITE_ORIGIN: ${value}`);
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "MARKA_LANDING_SITE_ORIGIN must be an origin with a root path",
    );
  }

  return new URL("/", url);
}

async function listFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function ensureFileExists(distDir, publicPath, description) {
  const pathname = new URL(publicPath, "http://public-output.invalid/")
    .pathname;
  const targetPath = resolve(distDir, `.${decodeURIComponent(pathname)}`);
  const safeRoot = resolve(distDir);

  if (targetPath !== safeRoot && !targetPath.startsWith(`${safeRoot}${sep}`)) {
    throw new Error(
      `Invalid public media path for ${description}: ${publicPath}`,
    );
  }

  try {
    const details = await stat(targetPath);
    if (!details.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Missing ${description}: ${publicPath}`);
  }

  return targetPath;
}

async function verifyLocalMediaUrl(value, context, siteUrl, distDir) {
  if (!value) throw new Error(`Missing local media URL for ${context}`);
  if (value.startsWith("data:")) return;

  let mediaUrl;
  try {
    mediaUrl = new URL(value, siteUrl);
  } catch {
    throw new Error(`Invalid media URL for ${context}: ${value}`);
  }

  if (
    mediaUrl.origin !== siteUrl.origin ||
    !["http:", "https:"].includes(mediaUrl.protocol)
  ) {
    throw new Error(`Non-local media URL for ${context}: ${value}`);
  }

  await ensureFileExists(
    distDir,
    mediaUrl.pathname,
    `local media target for ${context}`,
  );
}

function getSrcsetUrls(srcset) {
  return srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter(Boolean);
}

async function verifyMediaReferences(markup, textFiles, siteUrl, distDir) {
  const mediaTags = ["img", "video", "source", "audio", "track", "image"];

  for (const tagName of mediaTags) {
    for (const tag of findTags(markup, tagName)) {
      const attributes = parseAttributes(tag);
      for (const attributeName of ["src", "poster"]) {
        if (attributes.has(attributeName)) {
          await verifyLocalMediaUrl(
            attributes.get(attributeName),
            `<${tagName}> ${attributeName}`,
            siteUrl,
            distDir,
          );
        }
      }

      if (attributes.has("srcset")) {
        for (const candidate of getSrcsetUrls(attributes.get("srcset"))) {
          await verifyLocalMediaUrl(
            candidate,
            `<${tagName}> srcset`,
            siteUrl,
            distDir,
          );
        }
      }

      if (tagName === "image" && attributes.has("href")) {
        await verifyLocalMediaUrl(
          attributes.get("href"),
          "SVG image href",
          siteUrl,
          distDir,
        );
      }
    }
  }

  for (const tag of findTags(markup, "link")) {
    const attributes = parseAttributes(tag);
    const rel = attributes.get("rel")?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("icon") || rel.includes("apple-touch-icon")) {
      await verifyLocalMediaUrl(
        attributes.get("href"),
        `<link rel="${rel.join(" ")}">`,
        siteUrl,
        distDir,
      );
    }
  }

  for (const file of textFiles.filter(
    (path) => extname(path).toLowerCase() === ".css",
  )) {
    const css = await readFile(file, "utf8");
    const pattern = /url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi;
    for (const match of css.matchAll(pattern)) {
      const value = (match[2] ?? match[3] ?? "").trim();
      if (!value || value.startsWith("data:") || value.startsWith("#"))
        continue;
      await verifyLocalMediaUrl(
        value,
        `CSS url() in ${file}`,
        siteUrl,
        distDir,
      );
    }
  }
}

function findMeta(markup, attributeName, attributeValue) {
  return getSingleAttributeValue(
    markup,
    "meta",
    "content",
    (attributes) =>
      attributes.get(attributeName)?.toLowerCase() === attributeValue,
  );
}

function assertVideo(markup, demoId, { mobile = false } = {}) {
  const videoTags = findTags(markup, "video");
  if (videoTags.length !== 1) {
    throw new Error(
      `Expected one video for ${demoId}, found ${videoTags.length}`,
    );
  }

  const attributes = parseAttributes(videoTags[0]);
  const expectedSource = `/marketing/demos/${demoId}.mp4`;
  const expectedPoster = `/marketing/posters/${demoId}.webp`;

  if (attributes.get("src") !== expectedSource) {
    throw new Error(
      `Video ${demoId} must use its local recording ${expectedSource}`,
    );
  }
  if (attributes.get("poster") !== expectedPoster) {
    throw new Error(
      `Video ${demoId} must use its local poster ${expectedPoster}`,
    );
  }
  if (!attributes.has("muted") || !attributes.has("playsinline")) {
    throw new Error(`Video ${demoId} must be muted and play inline`);
  }
  if (attributes.has("autoplay")) {
    throw new Error(`Video ${demoId} must not autoplay`);
  }
  if (attributes.get("preload") !== "metadata") {
    throw new Error(`Video ${demoId} must preload metadata only`);
  }
  if (mobile && !attributes.has("loop")) {
    throw new Error("The mobile library preview must loop while it is in view");
  }
  if (!mobile && !/<button\b[^>]*aria-label=/i.test(markup)) {
    throw new Error(`Desktop video ${demoId} needs an accessible play button`);
  }
}

function assertExpectedSourceCards(markup) {
  for (const id of sourceCardIds) {
    const card = findElementBlock(markup, "article", "data-source-card", id);
    if (!card) throw new Error(`Missing source card ${id}`);
    const hasImage = findTags(card, "img").some(
      (tag) =>
        parseAttributes(tag).get("src") ===
        `/marketing/source-cards/${id}.webp`,
    );
    if (!hasImage) throw new Error(`Source card ${id} needs its local image`);
  }
}

function assertExpectedDemos(markup) {
  let videos = 0;
  let pendingDemos = 0;

  for (const id of desktopDemoIds) {
    const card = findElementBlock(markup, "article", "data-demo-card", id);
    if (!card) throw new Error(`Missing desktop demo ${id}`);

    if (findTags(card, "video").length === 1) {
      assertVideo(card, id);
      videos += 1;
      continue;
    }

    const hasPoster = findTags(card, "img").some(
      (tag) =>
        parseAttributes(tag).get("src") === `/marketing/posters/${id}.webp`,
    );
    if (!hasPoster || !card.includes(pendingLabel)) {
      throw new Error(
        `Demo ${id} must show its poster and pending review label`,
      );
    }
    pendingDemos += 1;
  }

  const mobileSection = findElementBlock(
    markup,
    "section",
    "data-page-section",
    "mobile-library",
  );
  const mobile = findElementBlock(
    mobileSection ?? "",
    "div",
    "data-mobile-demo",
    "mobile-library",
  );
  if (!mobile) throw new Error("Missing mobile library demo");
  const mobileAttributes = parseAttributes(findTags(mobile, "div")[0] ?? "");
  const mobileStatus = mobileAttributes.get("data-mobile-demo-status");

  if (findTags(mobile, "video").length === 1) {
    assertVideo(mobile, "mobile-library", { mobile: true });
    videos += 1;
  } else {
    const hasPoster = findTags(mobile, "img").some(
      (tag) =>
        parseAttributes(tag).get("src") ===
        "/marketing/posters/mobile-library.webp",
    );
    if (!hasPoster) {
      throw new Error("Mobile demo must show its local poster");
    }
    if (mobileStatus === "ready") {
      videos += 1;
    } else if (
      mobileStatus === "pending" &&
      mobileSection?.includes(pendingLabel)
    ) {
      pendingDemos += 1;
    } else {
      throw new Error("Mobile demo must be ready or visibly marked pending");
    }
  }

  return { videos, pendingDemos, mobileReady: mobileStatus === "ready" };
}

async function verifyStructuredData(markup, canonicalUrl) {
  const scripts = findTags(markup, "script").filter(
    (tag) =>
      parseAttributes(tag).get("type")?.toLowerCase() === "application/ld+json",
  );
  if (scripts.length !== 1) {
    throw new Error(`Expected one JSON-LD script, found ${scripts.length}`);
  }

  const scriptStart = markup.indexOf(scripts[0]) + scripts[0].length;
  const scriptEnd = markup.indexOf("</script>", scriptStart);
  let structuredData;
  try {
    structuredData = JSON.parse(markup.slice(scriptStart, scriptEnd));
  } catch {
    throw new Error("Invalid JSON-LD public structured data");
  }

  if (structuredData.url !== canonicalUrl) {
    throw new Error(
      `JSON-LD URL does not match the expected origin ${canonicalUrl}`,
    );
  }
}

async function verifyRobotsAndSitemap(distDir, siteUrl, localPreview) {
  const robotsPath = join(distDir, "robots.txt");
  const sitemapPath = join(distDir, "sitemap.xml");
  let robots;
  let sitemap;

  try {
    [robots, sitemap] = await Promise.all([
      readFile(robotsPath, "utf8"),
      readFile(sitemapPath, "utf8"),
    ]);
  } catch {
    throw new Error(
      "The public output must include robots.txt and sitemap.xml",
    );
  }

  inspectPublicMarkup(robots, robotsPath);
  inspectPublicMarkup(sitemap, sitemapPath);

  const sitemapUrl = new URL("/sitemap.xml", siteUrl).href;
  if (!robots.includes(`Sitemap: ${sitemapUrl}`)) {
    throw new Error(
      `robots.txt must reference the expected sitemap ${sitemapUrl}`,
    );
  }
  if (
    !/^user-agent:\s*\*\s*$/im.test(robots) ||
    !/^allow:\s*\/\s*$/im.test(robots)
  ) {
    throw new Error("robots.txt must allow public crawling");
  }

  const expectedPageUrl = new URL("/", siteUrl).href;
  const locations = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(
    (match) => match[1],
  );
  if (locations.length !== 1 || locations[0] !== expectedPageUrl) {
    throw new Error(
      `sitemap.xml must list only the expected page ${expectedPageUrl}`,
    );
  }

  const robotsContent = localPreview ? "noindex, nofollow" : "index, follow";
  return robotsContent;
}

export async function verifyPublicSite(options = {}) {
  const suppliedSiteOrigin =
    options.siteOrigin ?? process.env.MARKA_LANDING_SITE_ORIGIN;
  const releaseFlag =
    options.release ?? process.env.MARKA_LANDING_RELEASE === "1";
  const originValue = suppliedSiteOrigin ?? localPreviewOrigin;

  if (releaseFlag && !suppliedSiteOrigin) {
    throw new Error(
      "MARKA_LANDING_SITE_ORIGIN must be set explicitly for a release artifact",
    );
  }

  const siteUrl = normalizeOrigin(originValue);
  const localPreview = isLocalHost(siteUrl);
  const releaseArtifact = releaseFlag || !localPreview;

  if (releaseArtifact && localPreview) {
    throw new Error("A release artifact cannot use the local preview origin");
  }
  if (releaseArtifact && siteUrl.protocol !== "https:") {
    throw new Error("A release artifact must use an HTTPS site origin");
  }

  const distDir = resolve(options.distDir ?? defaultDistDirectory);
  let distDetails;
  try {
    distDetails = await stat(distDir);
  } catch {
    throw new Error(`Built public output does not exist: ${distDir}`);
  }
  if (!distDetails.isDirectory()) {
    throw new Error(`Built public output is not a directory: ${distDir}`);
  }

  const files = await listFiles(distDir);
  const textFiles = files.filter((file) =>
    textExtensions.has(extname(file).toLowerCase()),
  );
  for (const file of textFiles) {
    inspectPublicMarkup(await readFile(file, "utf8"), file);
  }

  const indexPath = join(distDir, "index.html");
  let markup;
  try {
    markup = await readFile(indexPath, "utf8");
  } catch {
    throw new Error("The public output is missing index.html");
  }

  const expectedPageUrl = new URL("/", siteUrl).href;
  const canonicalUrl = getSingleAttributeValue(
    markup,
    "link",
    "href",
    (attributes) => attributes.get("rel")?.toLowerCase() === "canonical",
  );
  if (canonicalUrl !== expectedPageUrl) {
    throw new Error(
      `Canonical URL must match the expected origin ${expectedPageUrl}`,
    );
  }

  if (findMeta(markup, "property", "og:url") !== expectedPageUrl) {
    throw new Error(
      `Open Graph URL must match the expected origin ${expectedPageUrl}`,
    );
  }

  const expectedSocialImageUrl = new URL(socialImagePath, siteUrl).href;
  if (findMeta(markup, "property", "og:image") !== expectedSocialImageUrl) {
    throw new Error(
      `Open Graph social image must use ${expectedSocialImageUrl}`,
    );
  }
  if (findMeta(markup, "name", "twitter:image") !== expectedSocialImageUrl) {
    throw new Error(`Twitter social image must use ${expectedSocialImageUrl}`);
  }
  await ensureFileExists(distDir, socialImagePath, "social image target");

  await verifyStructuredData(markup, expectedPageUrl);
  const expectedRobots = await verifyRobotsAndSitemap(
    distDir,
    siteUrl,
    localPreview,
  );
  const actualRobots = findMeta(markup, "name", "robots")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (actualRobots !== expectedRobots) {
    throw new Error(`Robots meta must be "${expectedRobots}" for this origin`);
  }

  await verifyMediaReferences(markup, textFiles, siteUrl, distDir);
  assertExpectedSourceCards(markup);
  const { videos, pendingDemos, mobileReady } = assertExpectedDemos(markup);

  const hasApprovedPreview = markup.includes(previewImagePath);
  if (releaseArtifact && !hasApprovedPreview) {
    throw new Error(
      "Release output requires an approved product preview capture",
    );
  }
  if (hasApprovedPreview) {
    await ensureFileExists(distDir, previewImagePath, "product preview target");
  }

  if (mobileReady) {
    await ensureFileExists(
      distDir,
      "/marketing/demos/mobile-library.mp4",
      "local mobile library recording",
    );
  }

  if (releaseArtifact && pendingDemos > 0) {
    throw new Error("Release output cannot contain pending demo recordings");
  }
  if (releaseArtifact && videos !== allDemoIds.length) {
    throw new Error(
      "Release output must include all reviewed desktop and mobile videos",
    );
  }

  return {
    origin: siteUrl.href,
    files: files.length,
    mediaReferences:
      findTags(markup, "img").length + findTags(markup, "video").length,
    sourceCards: sourceCardIds.length,
    desktopDemos: desktopDemoIds.length,
    videos,
    pendingDemos,
    releaseArtifact,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await verifyPublicSite();
    console.log(
      `Verified Marka public output at ${result.origin}: ${result.sourceCards} source cards, ${result.videos} videos, ${result.pendingDemos} pending demos.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
