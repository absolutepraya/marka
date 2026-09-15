import {
  access,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = path.join(ROOT, "docs/roadmap/roadmap.excalidraw");
const GENERATED_PATH = path.join(
  ROOT,
  "docs/roadmap/roadmap.generated.excalidraw",
);
const ROADMAP_DIR = path.join(ROOT, "docs/roadmap");
const OUTPUT_PATHS = {
  lightSvg: path.join(ROADMAP_DIR, "roadmap-light.svg"),
  lightPng: path.join(ROADMAP_DIR, "roadmap-light.png"),
  darkSvg: path.join(ROADMAP_DIR, "roadmap-dark.svg"),
  darkPng: path.join(ROADMAP_DIR, "roadmap-dark.png"),
  legacySvg: path.join(ROADMAP_DIR, "roadmap.svg"),
  legacyPng: path.join(ROADMAP_DIR, "roadmap.png"),
};
const README_PATH = path.join(ROOT, "README.md");
const DEFAULT_REPOSITORY = "absolutepraya/marka";
const FRAME_WIDTH = 3;
const FRAME_RADIUS = 24;
const EXPECTED_ISSUES = [
  25, 26, 28, 34, 37, 38, 46, 55, 62, 63, 64, 65, 66, 67, 68, 69, 75, 78,
];
const LIGHT_THEME = {
  id: "light",
  foreground: "#212529",
  mutedForeground: "#495057",
  completedNodeFill: "#e9ecef",
  completedNodeStroke: "#adb5bd",
  colorMap: new Map(),
};
const DARK_THEME = {
  id: "dark",
  foreground: "#f8f9fa",
  mutedForeground: "#adb5bd",
  completedNodeFill: "#343a40",
  completedNodeStroke: "#868e96",
  colorMap: new Map([
    ["#c3fae8", "#0b5345"],
    ["#d0ebff", "#164e73"],
    ["#d3f9d8", "#1f6f3d"],
    ["#e5dbff", "#4c2a85"],
    ["#e9ecef", "#343a40"],
    ["#fff3bf", "#6b4f00"],
    ["#087f5b", "#63e6be"],
    ["#1f2937", "#f8f9fa"],
    ["#212529", "#f8f9fa"],
    ["#228be6", "#74c0fc"],
    ["#2f9e44", "#8ce99a"],
    ["#6741d9", "#b197fc"],
    ["#f08c00", "#ffd43b"],
    ["#495057", "#ced4da"],
    ["#868e96", "#adb5bd"],
    ["#adb5bd", "#868e96"],
  ]),
};

const source = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
const model = validateScene(source);

if (process.argv.includes("--check")) {
  console.log(
    "Roadmap metadata valid: " +
      model.nodes.length +
      " nodes, " +
      model.edges.length +
      " dependencies",
  );
  process.exit(0);
}

if (!process.argv.includes("--render")) {
  console.error("Usage: node scripts/render-roadmap.mjs --check|--render");
  process.exit(1);
}

const states = await fetchIssueStates(model.nodes);
const generated = createGeneratedScene(
  source,
  model.nodes,
  states,
  LIGHT_THEME,
);
const themedScenes = {
  light: generated,
  dark: createGeneratedScene(source, model.nodes, states, DARK_THEME),
};
const rendered = {
  light: await renderWithExcalidraw(themedScenes.light, LIGHT_THEME),
  dark: await renderWithExcalidraw(themedScenes.dark, DARK_THEME),
};
await validateRenderedOutputs(rendered);
const readme = await updateReadme();
const outputFiles = [
  {
    path: GENERATED_PATH,
    data: JSON.stringify(generated, null, 2) + "\n",
  },
  { path: OUTPUT_PATHS.lightSvg, data: rendered.light.svg },
  { path: OUTPUT_PATHS.lightPng, data: rendered.light.png },
  { path: OUTPUT_PATHS.darkSvg, data: rendered.dark.svg },
  { path: OUTPUT_PATHS.darkPng, data: rendered.dark.png },
  { path: OUTPUT_PATHS.legacySvg, data: rendered.light.svg },
  { path: OUTPUT_PATHS.legacyPng, data: rendered.light.png },
  { path: README_PATH, data: readme },
];
await writeOutputSet(outputFiles);

console.log("Rendered roadmap for " + model.nodes.length + " issues");
for (const output of outputFiles) {
  if (output.path === README_PATH) {
    continue;
  }
  console.log("  " + path.relative(ROOT, output.path));
}

function validateScene(scene) {
  if (
    scene.type !== "excalidraw" ||
    scene.version !== 2 ||
    !Array.isArray(scene.elements)
  ) {
    throw new Error("Source is not a version 2 Excalidraw scene");
  }

  const textElements = scene.elements.filter(
    (element) => element.type === "text",
  );
  if (textElements.some((element) => element.fontFamily !== 5)) {
    throw new Error(
      "Every source text element must use Excalifont (fontFamily 5)",
    );
  }
  const textGeometryFields = [
    "x",
    "y",
    "width",
    "height",
    "fontSize",
    "lineHeight",
  ];
  const invalidText = textElements.find((element) =>
    textGeometryFields.some((field) => !Number.isFinite(element[field])),
  );
  if (invalidText) {
    throw new Error(
      "Source text element " +
        (invalidText.id || "<unknown>") +
        " must define finite " +
        textGeometryFields.join(", "),
    );
  }

  const nodes = scene.elements
    .filter((element) => element.customData?.roadmap?.kind === "issue")
    .map((element) => {
      const roadmap = element.customData.roadmap;
      if (!Number.isInteger(roadmap.issueNumber) || roadmap.issueNumber < 1) {
        throw new Error(
          "Invalid issue number on node " + (roadmap.nodeId || element.id),
        );
      }
      if (!roadmap.nodeId || !roadmap.label || !roadmap.url) {
        throw new Error(
          "Incomplete roadmap metadata on issue #" + roadmap.issueNumber,
        );
      }
      const label = scene.elements.find(
        (candidate) =>
          candidate.customData?.roadmap?.kind === "label" &&
          candidate.customData.roadmap.nodeId === roadmap.nodeId,
      );
      if (!label || label.text !== roadmap.label) {
        throw new Error(
          "Issue #" + roadmap.issueNumber + " has no matching label",
        );
      }
      if (
        !element.boundElements?.some(
          (binding) => binding.type === "text" && binding.id === label.id,
        )
      ) {
        throw new Error(
          "Issue #" + roadmap.issueNumber + " rectangle must bind its label",
        );
      }
      if (element.link !== roadmap.url || label.link !== roadmap.url) {
        throw new Error(
          "Issue #" + roadmap.issueNumber + " must link to GitHub",
        );
      }
      return { element, labelElement: label, ...roadmap };
    });

  if (nodes.length !== EXPECTED_ISSUES.length) {
    throw new Error(
      "Expected " +
        EXPECTED_ISSUES.length +
        " issue nodes, found " +
        nodes.length,
    );
  }

  const nodeIds = new Set();
  const issueNumbers = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.nodeId)) {
      throw new Error("Duplicate roadmap node " + node.nodeId);
    }
    if (issueNumbers.has(node.issueNumber)) {
      throw new Error("Duplicate issue #" + node.issueNumber);
    }
    nodeIds.add(node.nodeId);
    issueNumbers.add(node.issueNumber);
  }

  const expected = new Set(EXPECTED_ISSUES);
  if (
    issueNumbers.size !== expected.size ||
    [...issueNumbers].some((issueNumber) => !expected.has(issueNumber))
  ) {
    throw new Error(
      "Source issue set must be exactly: " +
        EXPECTED_ISSUES.map((number) => "#" + number).join(", "),
    );
  }

  const edges = scene.elements
    .filter((element) => element.customData?.roadmap?.kind === "dependency")
    .map((element) => ({ element, ...element.customData.roadmap }));
  const edgeKeys = new Set();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(
        "Dependency " +
          edge.from +
          " -> " +
          edge.to +
          " references a missing node",
      );
    }
    if (edge.from === edge.to) {
      throw new Error("Dependency " + edge.from + " points to itself");
    }
    const key = edge.from + "->" + edge.to;
    if (edgeKeys.has(key)) {
      throw new Error("Duplicate dependency " + key);
    }
    edgeKeys.add(key);
  }

  const adjacency = new Map(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    adjacency.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) {
      throw new Error("Dependency cycle includes " + nodeId);
    }
    if (visited.has(nodeId)) {
      return;
    }
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId)) {
      visit(next);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) {
    visit(node.nodeId);
  }

  return { nodes, edges };
}

async function fetchIssueStates(nodes) {
  const repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "marka-roadmap-renderer",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };

  const entries = await Promise.all(
    nodes.map(async (node) => {
      const response = await fetch(
        "https://api.github.com/repos/" +
          repository +
          "/issues/" +
          node.issueNumber,
        { headers },
      );
      if (!response.ok) {
        throw new Error(
          "GitHub issue #" +
            node.issueNumber +
            " lookup failed: HTTP " +
            response.status,
        );
      }
      const issue = await response.json();
      if (issue.pull_request) {
        throw new Error(
          "#" + node.issueNumber + " is a pull request, not an issue",
        );
      }
      if (issue.state !== "open" && issue.state !== "closed") {
        throw new Error(
          "#" + node.issueNumber + " returned unsupported state " + issue.state,
        );
      }
      return [node.nodeId, issue.state];
    }),
  );

  return new Map(entries);
}

function createGeneratedScene(scene, nodes, states, theme) {
  const generated = structuredClone(scene);
  applyThemeColors(generated, theme);
  generated.elements = generated.elements.map((element) => {
    const roadmap = element.customData?.roadmap;
    if (!roadmap?.nodeId || !states.has(roadmap.nodeId)) {
      return element;
    }

    const state = states.get(roadmap.nodeId);
    const next = {
      ...element,
      customData: {
        ...element.customData,
        roadmap: { ...roadmap, status: state },
      },
    };

    if (
      ["label", "issue-number", "issue-number-bold"].includes(roadmap.kind) &&
      state === "closed"
    ) {
      next.opacity = 68;
      next.strokeColor = theme.mutedForeground;
    }
    if (roadmap.kind === "issue" && state === "closed") {
      next.backgroundColor = theme.completedNodeFill;
      next.strokeColor = theme.completedNodeStroke;
    }
    return next;
  });

  for (const node of nodes) {
    if (states.get(node.nodeId) !== "closed") {
      continue;
    }
    generated.elements.push(...createCompletionMarker(node, theme));
    generated.elements.push(
      ...createTextStrikes(node, node.labelElement, theme),
    );
    const numberElements = generated.elements.filter(
      (element) =>
        element.customData?.roadmap?.nodeId === node.nodeId &&
        ["issue-number", "issue-number-bold"].includes(
          element.customData.roadmap.kind,
        ),
    );
    for (const numberElement of numberElements) {
      generated.elements.push(...createTextStrikes(node, numberElement, theme));
    }
  }

  return generated;
}

function applyThemeColors(scene, theme) {
  if (theme.colorMap.size === 0) {
    return;
  }

  scene.elements = scene.elements.map((element) => ({
    ...element,
    strokeColor: mapThemeColor(element.strokeColor, theme),
    backgroundColor: mapThemeColor(element.backgroundColor, theme),
  }));
}

function mapThemeColor(color, theme) {
  if (!color) {
    return color;
  }
  return theme.colorMap.get(color.toLowerCase()) ?? color;
}

function createCompletionMarker(node, theme) {
  const rect = node.element;
  const checkbox = {
    ...baseElement(
      node.nodeId + "-complete-box",
      "rectangle",
      rect.x + rect.width - 58,
      rect.y + 14,
      30,
      30,
    ),
    strokeColor: theme.completedNodeStroke,
    backgroundColor: theme.completedNodeFill,
    strokeWidth: 2,
    roughness: 1,
    roundness: { type: 3 },
    groupIds: [node.nodeId],
    link: node.url,
    customData: {
      roadmap: {
        kind: "completion-checkbox",
        nodeId: node.nodeId,
        status: "closed",
      },
    },
  };
  const checkmark = {
    ...baseElement(
      node.nodeId + "-complete-check",
      "text",
      rect.x + rect.width - 58,
      rect.y + 12,
      30,
      30,
    ),
    text: "✓",
    originalText: "✓",
    fontSize: 22,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "middle",
    strokeColor: theme.mutedForeground,
    groupIds: [node.nodeId],
    link: node.url,
    customData: {
      roadmap: {
        kind: "completion-marker",
        nodeId: node.nodeId,
        status: "closed",
      },
    },
  };
  return [checkbox, checkmark];
}

function createTextStrikes(node, label, theme) {
  const lines = label.text.split("\n");
  const lineHeight = label.fontSize * label.lineHeight;
  const lineGap =
    (lineHeight - label.fontSize * 0.886 + label.fontSize * -0.374) / 2;
  const verticalOffset = label.fontSize * 0.886 + lineGap;
  const strikeOffset = label.fontSize * 0.3;

  return lines.map((line, index) => {
    const width = Math.min(
      label.width - 20,
      Math.max(32, line.length * label.fontSize * 0.48),
    );
    const x = label.x + (label.width - width) / 2;
    const y = label.y + verticalOffset + index * lineHeight - strikeOffset;

    return {
      ...baseElement(
        node.nodeId + "-strike-" + label.id + "-" + index,
        "line",
        x,
        y,
        width,
        0,
      ),
      strokeColor: theme.mutedForeground,
      strokeWidth: 2,
      roughness: 2,
      points: [
        [0, 0],
        [width, 0],
      ],
      groupIds: [node.nodeId],
      customData: {
        roadmap: {
          kind: "completion-strike",
          nodeId: node.nodeId,
          textElementId: label.id,
          status: "closed",
        },
      },
    };
  });
}

async function renderWithExcalidraw(scene, theme) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import { exportToSvg, exportToCanvas } from '@excalidraw/excalidraw';

        function roundedPath(context, x, y, width, height, radius) {
          const safeRadius = Math.min(radius, width / 2, height / 2);
          context.beginPath();
          context.moveTo(x + safeRadius, y);
          context.arcTo(x + width, y, x + width, y + height, safeRadius);
          context.arcTo(x + width, y + height, x, y + height, safeRadius);
          context.arcTo(x, y + height, x, y, safeRadius);
          context.arcTo(x, y, x + width, y, safeRadius);
          context.closePath();
        }

        function frameCanvas(sourceCanvas, frame) {
          const canvas = document.createElement('canvas');
          canvas.width = sourceCanvas.width;
          canvas.height = sourceCanvas.height;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Unable to create a canvas context for roadmap framing');
          }

          context.save();
          roundedPath(context, 0, 0, canvas.width, canvas.height, frame.radius);
          context.clip();
          context.drawImage(sourceCanvas, 0, 0);
          context.restore();

          context.save();
          const inset = frame.width / 2;
          roundedPath(
            context,
            inset,
            inset,
            canvas.width - frame.width,
            canvas.height - frame.width,
            frame.radius,
          );
          context.strokeStyle = frame.color;
          context.lineWidth = frame.width;
          context.stroke();
          context.restore();
          return canvas;
        }

        window.__renderRoadmap = async (scene, frame) => {
          const appState = {
            ...scene.appState,
            exportWithDarkMode: false,
            exportBackground: false,
            viewBackgroundColor: '#ffffff',
          };
          const options = {
            elements: scene.elements,
            appState,
            files: scene.files || {},
            exportPadding: 100,
          };
          const svg = await exportToSvg(options);
          const canvas = await exportToCanvas(options);
          const framedCanvas = frameCanvas(canvas, frame);
          return {
            svg: svg.outerHTML,
            png: framedCanvas.toDataURL('image/png'),
          };
        };
      `,
      resolveDir: ROOT,
      sourcefile: "roadmap-export-entry.js",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    loader: { ".css": "empty" },
  });

  const launchOptions = {
    headless: true,
    args: ["--no-sandbox"],
  };
  const executablePath = await findChromiumExecutable();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    throw new Error(
      "Unable to start Chromium for faithful Excalidraw export. " +
        "Run pnpm exec playwright install chromium or set ROADMAP_CHROMIUM_PATH.",
      { cause: error },
    );
  }

  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(
      ([value, frame]) => window.__renderRoadmap(value, frame),
      [
        scene,
        {
          color: theme.foreground,
          width: FRAME_WIDTH,
          radius: FRAME_RADIUS,
        },
      ],
    );
    const prefix = "data:image/png;base64,";
    if (!result.png.startsWith(prefix)) {
      throw new Error("Excalidraw PNG export did not return a PNG data URL");
    }
    return {
      svg: addSvgFrame(result.svg, theme),
      png: Buffer.from(result.png.slice(prefix.length), "base64"),
    };
  } finally {
    await browser.close();
  }
}

function addSvgFrame(svg, theme) {
  const dimensions = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!dimensions) {
    throw new Error("Excalidraw SVG is missing a numeric viewBox");
  }
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  const clipId = "roadmap-" + theme.id + "-frame-clip";
  const safeRadius = Math.min(FRAME_RADIUS, width / 2, height / 2);
  const clipPath =
    '<clipPath id="' +
    clipId +
    '" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="' +
    width +
    '" height="' +
    height +
    '" rx="' +
    safeRadius +
    '" /></clipPath>';
  const root = svg.match(/^<svg\b[^>]*>/)?.[0];
  if (!root) {
    throw new Error("Excalidraw SVG is missing its root element");
  }
  const clipped = svg.replace(
    root,
    root.slice(0, -1) + ' clip-path="url(#' + clipId + ')">',
  );
  const clippedRoot = clipped.match(/^<svg\b[^>]*>/)?.[0];
  if (!clippedRoot) {
    throw new Error("Excalidraw SVG is missing its framed root element");
  }
  const withClipPath = clipped.includes("<defs>")
    ? clipped.replace("<defs>", "<defs>" + clipPath)
    : clipped.replace(
        clippedRoot,
        clippedRoot + "<defs>" + clipPath + "</defs>",
      );
  const inset = FRAME_WIDTH / 2;
  const frame =
    '<rect x="' +
    inset +
    '" y="' +
    inset +
    '" width="' +
    (width - FRAME_WIDTH) +
    '" height="' +
    (height - FRAME_WIDTH) +
    '" rx="' +
    safeRadius +
    '" fill="none" stroke="' +
    theme.foreground +
    '" stroke-width="' +
    FRAME_WIDTH +
    '" />';
  return withClipPath.replace("</svg>", frame + "</svg>");
}

async function validateRenderedOutputs(rendered) {
  for (const [themeId, output] of Object.entries(rendered)) {
    if (
      !output.svg.includes("<clipPath") ||
      !output.svg.includes('fill="none"')
    ) {
      throw new Error("The " + themeId + " SVG is missing its rounded frame");
    }
    if (output.svg.includes('fill="#ffffff"')) {
      throw new Error("The " + themeId + " SVG has an opaque white background");
    }
    if (!Buffer.isBuffer(output.png) || output.png.length === 0) {
      throw new Error("The " + themeId + " PNG is empty");
    }

    const { data, info } = await sharp(output.png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const corners = [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ];
    for (const [x, y] of corners) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha !== 0) {
        throw new Error(
          "The " +
            themeId +
            " PNG corner at " +
            x +
            "," +
            y +
            " is not transparent",
        );
      }
    }
  }
}

async function writeOutputSet(files) {
  const temporaryDirectory = await mkdtemp(path.join(ROOT, ".roadmap-render-"));
  try {
    await Promise.all(
      files.map((file) =>
        writeFile(
          path.join(temporaryDirectory, path.basename(file.path)),
          file.data,
        ),
      ),
    );
    for (const file of files) {
      await rename(
        path.join(temporaryDirectory, path.basename(file.path)),
        file.path,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function findChromiumExecutable() {
  const candidates = [
    process.env.ROADMAP_CHROMIUM_PATH,
    chromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

async function updateReadme() {
  const readme = await readFile(README_PATH, "utf8");
  const block =
    "<!-- ROADMAP:START -->\n" +
    "## Roadmap\n\n" +
    '<a href="./docs/roadmap/roadmap.excalidraw">\n' +
    "  <picture>\n" +
    '    <source media="(prefers-color-scheme: dark)" ' +
    'srcset="./docs/roadmap/roadmap-dark.png">\n' +
    '    <source media="(prefers-color-scheme: light)" ' +
    'srcset="./docs/roadmap/roadmap-light.png">\n' +
    '    <img src="./docs/roadmap/roadmap-light.png" ' +
    'alt="Marka Roadmap">\n' +
    "  </picture>\n" +
    "</a>\n\n" +
    "[Open the editable Excalidraw source](./docs/roadmap/roadmap.excalidraw)\n" +
    "<!-- ROADMAP:END -->";
  const marker = /<!-- ROADMAP:START -->[\s\S]*?<!-- ROADMAP:END -->/;
  if (!marker.test(readme)) {
    throw new Error("README is missing the marked Roadmap block");
  }
  return readme.replace(marker, block);
}

function baseElement(id, type, x, y, width, height) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#495057",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: null,
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    boundElements: null,
    updated: 0,
    link: null,
    locked: false,
  };
}

export { validateScene };
