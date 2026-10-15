import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateAssets, manifest } from "./generate-marka-assets.mjs";

const BRAND_NAVY = [3, 19, 47];
const BRAND_WHITE = [255, 255, 255];
const COMPOSER_SOURCE = "assets/brand/marka/source/marka-ios-app-icon-dark.png";
const SOURCE_HASHES = {
  "assets/brand/marka/source/marka-social.png":
    "05722bd2e82c890dd2ef7d52ae13b454a0a660984663f1e0ad21be79f79ff755",
  [COMPOSER_SOURCE]:
    "23144032b5366b56a9ae0cc502b058f10c08ddcb61872025f1f5fbc542258357",
  "assets/brand/marka/source/marka-navy-app-icon.png":
    "9e7ebfe3ada9756fdc3eda2757c73b4da13b439d9ae06e147dbe5a8692c881f3",
  "assets/brand/marka/source/marka-navy-mark.png":
    "8e52090957e27ca853cc054be622091bf207b697aea6befc0f67e5a9f53b6dd7",
  "assets/brand/marka/source/marka-navy-wordmark.png":
    "bbce1cadff00fd9b1e70597f01cc00f6c369fabae5994c9d0b91a95e364fdb58",
  "assets/brand/marka/source/marka-white-app-icon.png":
    "6c426b5e50eeaea82d41d77dda9e67590062b255fbe9687ce6753f26eef00b1a",
  "assets/brand/marka/source/marka-white-mark.png":
    "f76da5e383b5c4a1ff004b6399da1a736fee090bdd9cdbcf172b2213d0ca3e2b",
  "assets/brand/marka/source/marka-white-wordmark.png":
    "977ca1221aee8810668e1b2b5a4009304dcfd902eb7b81dda52ff360799050c9",
};

async function colorsIn(path) {
  const { data, info } = await sharp(path)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = new Set();

  for (let index = 0; index < data.length; index += info.channels) {
    if (info.channels === 4 && data[index + 3] === 0) {
      continue;
    }

    colors.add(
      `${data[index].toString(16).padStart(2, "0")}${data[index + 1]
        .toString(16)
        .padStart(2, "0")}${data[index + 2].toString(16).padStart(2, "0")}`,
    );
  }

  return colors;
}

async function pixelsIn(path) {
  return sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function pixelAt(data, info, x, y) {
  const index = (y * info.width + x) * info.channels;
  return [...data.subarray(index, index + info.channels)];
}

test("preserves the supplied Marka source PNG bytes", async () => {
  for (const [path, expectedHash] of Object.entries(SOURCE_HASHES)) {
    const source = await readFile(path);
    const actualHash = createHash("sha256").update(source).digest("hex");
    assert.equal(actualHash, expectedHash, path);
  }
});

test("preserves the supplied installed-app icon and social-preview artwork", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });
  const expected = createHash("sha256")
    .update(await readFile(COMPOSER_SOURCE))
    .digest("hex");
  const actual = createHash("sha256")
    .update(
      await readFile(
        join(
          outputRoot,
          "apps/web/public/brand/marka/marka-apple-touch-icon.png",
        ),
      ),
    )
    .digest("hex");

  assert.equal(actual, expected);
  assert.deepEqual(
    await readFile(
      join(outputRoot, "apps/web/public/brand/marka/marka-social.png"),
    ),
    await readFile("assets/brand/marka/source/marka-social.png"),
  );
});

test("generates every declared Marka PNG at its manifest dimensions", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });
  for (const output of manifest.outputs.filter(
    (output) => !output.preserveArtwork && !output.trim,
  )) {
    const metadata = await sharp(join(outputRoot, output.path)).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.width, output.width);
    assert.equal(metadata.height, output.height);
  }
});

test("retains Composer artwork color detail in resized PWA icons", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });
  const colors = await colorsIn(
    join(outputRoot, "apps/web/public/brand/marka/marka-icon-512.png"),
  );

  assert.ok(colors.size > 2);
});

test("regenerates Marka assets deterministically", async () => {
  const firstOutputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  const secondOutputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot: firstOutputRoot, writeIco: false });
  await generateAssets({ outputRoot: secondOutputRoot, writeIco: false });

  for (const output of manifest.outputs) {
    const [first, second] = await Promise.all([
      readFile(join(firstOutputRoot, output.path)),
      readFile(join(secondOutputRoot, output.path)),
    ]);
    assert.deepEqual(first, second, output.path);
  }
});

test("generates only exact navy and white nontransparent Marka pixels", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });

  const approvedColors = new Set([
    BRAND_NAVY.map((part) => part.toString(16).padStart(2, "0")).join(""),
    BRAND_WHITE.map((part) => part.toString(16).padStart(2, "0")).join(""),
  ]);

  for (const output of manifest.outputs.filter(
    (output) => !output.preserveArtwork,
  )) {
    const colors = await colorsIn(join(outputRoot, output.path));
    assert.ok(colors.size > 0, output.path);
    assert.ok(
      [...colors].every((color) => approvedColors.has(color)),
      output.path,
    );
  }
});

test("generates transparent header wordmarks from one shared alpha geometry", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });
  const navyPath = join(
    outputRoot,
    "apps/web/public/brand/marka/marka-wordmark-navy.png",
  );
  const whitePath = join(
    outputRoot,
    "apps/web/public/brand/marka/marka-wordmark-white.png",
  );
  const navy = await pixelsIn(navyPath);
  const white = await pixelsIn(whitePath);

  assert.deepEqual(navy.info, white.info);
  assert.equal(navy.info.channels, 4);
  assert.equal(navy.info.width, 510);
  assert.equal(navy.info.height, 135);

  for (let index = 0; index < navy.data.length; index += 4) {
    assert.equal(navy.data[index + 3], white.data[index + 3]);
    if (navy.data[index + 3] === 0) {
      continue;
    }

    assert.deepEqual([...navy.data.subarray(index, index + 3)], BRAND_NAVY);
    assert.deepEqual([...white.data.subarray(index, index + 3)], BRAND_WHITE);
  }
});

test("declares and applies ImageMagick trimming to transparent wordmark outputs", async () => {
  const expectedPaths = [
    "apps/web/public/brand/marka/marka-wordmark-navy.png",
    "apps/web/public/brand/marka/marka-wordmark-white.png",
    "screenshots/marka-logo.png",
    "apps/landing/public/brand/marka/marka-wordmark-navy.png",
    "apps/landing/public/brand/marka/marka-wordmark-white.png",
    "docs/static/img/brand/marka/marka-wordmark-navy.png",
    "docs/static/img/brand/marka/marka-wordmark-white.png",
  ];

  for (const path of expectedPaths) {
    const output = manifest.outputs.find((output) => output.path === path);
    assert.equal(output?.trim, true, path);
  }
});

test("generates favicon tiles with transparent backgrounds", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "marka-assets-"));
  await generateAssets({ outputRoot, writeIco: false });

  const faviconOutputs = manifest.outputs.filter(
    (output) =>
      output.path.endsWith("marka-favicon-light.png") ||
      output.path.endsWith("marka-favicon-dark.png"),
  );
  assert.equal(faviconOutputs.length, 2);
  assert.ok(faviconOutputs.every((output) => output.trim));
  assert.equal(faviconOutputs[0].source, faviconOutputs[1].source);
  assert.equal(faviconOutputs[0].foreground, "#03132F");
  assert.equal(faviconOutputs[1].foreground, undefined);
  assert.ok(faviconOutputs.every((output) => output.padToSquare));

  const faviconSource = manifest.sources.find(
    (source) => source.source === faviconOutputs[0].source,
  );
  assert.equal(faviconSource?.padding, 0.16);

  const light = await pixelsIn(
    join(outputRoot, "apps/web/public/brand/marka/marka-favicon-light.png"),
  );
  const dark = await pixelsIn(
    join(outputRoot, "apps/web/public/brand/marka/marka-favicon-dark.png"),
  );
  assert.deepEqual(light.info, dark.info);
  for (let index = 3; index < light.data.length; index += light.info.channels) {
    assert.equal(light.data[index], dark.data[index], `alpha at ${index}`);
  }

  for (const name of ["marka-favicon-light.png", "marka-favicon-dark.png"]) {
    const { data, info } = await pixelsIn(
      join(outputRoot, "apps/web/public/brand/marka", name),
    );

    assert.equal(info.width, info.height, `${name} must be square`);

    for (const [x, y] of [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ]) {
      assert.equal(pixelAt(data, info, x, y)[3], 0, `${name} at ${x},${y}`);
    }

    for (const x of [0, info.width - 1]) {
      for (let y = 0; y < info.height; y += 1) {
        assert.equal(
          pixelAt(data, info, x, y)[3],
          0,
          `${name} edge at ${x},${y}`,
        );
      }
    }

    const alphaValues = [];
    for (let index = 0; index < data.length; index += info.channels) {
      alphaValues.push(data[index + 3]);
    }

    assert.ok(
      alphaValues.some((alpha) => alpha === 0),
      `${name} background`,
    );
    assert.ok(
      alphaValues.some((alpha) => alpha > 0),
      `${name} logo`,
    );
  }
});
