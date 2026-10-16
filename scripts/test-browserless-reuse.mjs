import { execFile, execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--with-baseline"))
  throw new Error("Usage: test-browserless-reuse.mjs [--with-baseline]");
const withBaseline = args[0] === "--with-baseline";
const container = "marka-dev-browserless";
const root = fileURLToPath(new URL("../", import.meta.url));
let info;
try {
  info = JSON.parse(
    execFileSync("docker", ["inspect", container], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  )[0];
} catch {
  throw new Error("Start local infrastructure first: pnpm dev:infra:up");
}
const binding = info.HostConfig.PortBindings["3000/tcp"]?.[0];
if (!info.State.Running || binding?.HostIp !== "127.0.0.1")
  throw new Error(
    "Expected a running loopback-only local Browserless container",
  );
const token = info.Config.Env.find((value) =>
  value.startsWith("TOKEN="),
)?.slice(6);
if (!token) throw new Error("Local Browserless test token is missing");
console.log(
  "Testing local Browserless only; production and app data are not accessed.",
);
console.log(
  "BROWSERLESS_CONTAINER",
  JSON.stringify({
    image: info.Config.Image,
    memoryLimitBytes: info.HostConfig.Memory,
  }),
);
function memoryEvents() {
  try {
    const raw = execFileSync(
      "docker",
      ["exec", container, "cat", "/sys/fs/cgroup/memory.events"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return Object.fromEntries(
      raw
        .trim()
        .split("\n")
        .map((line) => {
          const [key, value] = line.split(/\s+/);
          return [key, Number(value)];
        }),
    );
  } catch {
    return null;
  } // Unavailable on hosts without cgroup v2.
}
const eventsBefore = memoryEvents();
let phase = "startup";
const peaks = new Map();
let sampling = false;
function sample() {
  if (sampling) return;
  sampling = true;
  const sampledPhase = phase;
  execFile(
    "docker",
    ["stats", "--no-stream", "--format", "{{.MemUsage}}", container],
    { timeout: 5000 },
    (error, stdout) => {
      sampling = false;
      if (error) return;
      const match = stdout.match(/([\d.]+)([KMG]i?B)/);
      if (!match) return;
      const factors = {
        KiB: 1 / 1024,
        MiB: 1,
        GiB: 1024,
        KB: 1000 / 1048576,
        MB: 1000000 / 1048576,
        GB: 1000000000 / 1048576,
      };
      const value = Number(match[1]) * factors[match[2]];
      peaks.set(sampledPhase, Math.max(peaks.get(sampledPhase) || 0, value));
    },
  );
}
const samplingTimer = setInterval(sample, 2000);
sample();
const child = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
    ),
    "run",
    "--root",
    "apps/workers",
    "browserless.integration.test.ts",
  ],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NO_COLOR: "false",
      CRAWLER_BROWSERLESS_INTEGRATION: "1",
      CRAWLER_BROWSERLESS_BASELINE: withBaseline ? "1" : "0",
      CRAWLER_BROWSERLESS_TEST_URL: `ws://127.0.0.1:${binding.HostPort}`,
      CRAWLER_BROWSERLESS_TEST_TOKEN: token,
    },
  },
);
for (const [stream, output] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  let buffered = "";
  stream.on("data", (data) => {
    buffered += data.toString();
    let index;
    while ((index = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, index + 1).replaceAll(token, "<redacted>");
      output.write(line);
      const marker = "BROWSERLESS_PHASE ";
      if (line.includes(marker)) {
        const record = JSON.parse(
          line.slice(line.indexOf(marker) + marker.length),
        );
        phase =
          record.state === "start"
            ? `reuse=${record.reuse},concurrency=${record.concurrency}`
            : "lifecycle";
      }
      buffered = buffered.slice(index + 1);
    }
  });
  stream.on("end", () => {
    if (buffered) output.write(buffered.replaceAll(token, "<redacted>"));
  });
}
child.on("error", () => {
  console.error("Unable to start the local Browserless tests");
  process.exitCode = 1;
});
child.on("close", (code) => {
  clearInterval(samplingTimer);
  console.log(
    "BROWSERLESS_SAMPLED_RENDERER_PEAK_MIB",
    JSON.stringify(
      Object.fromEntries(
        [...peaks].map(([key, value]) => [key, Math.round(value)]),
      ),
    ),
  );
  console.log(
    "BROWSERLESS_MEMORY_EVENTS",
    JSON.stringify({ before: eventsBefore, after: memoryEvents() }),
  );
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
