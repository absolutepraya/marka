import { spawnSync } from "node:child_process";

process.loadEnvFile(".env");
const port = Number(process.env.KARAKEEP_PORT || 3000);
const workerPort = Number(process.env.WORKERS_PORT || port + 10000);
if (
  ![port, workerPort].every(
    (value) => Number.isInteger(value) && value > 0 && value <= 65535,
  )
) {
  throw new Error("Invalid local web or worker port");
}
let failed = false;
for (const [name, url] of [
  ["Web health", `http://127.0.0.1:${port}/api/health`],
  ["Worker readiness", `http://127.0.0.1:${workerPort}/ready`],
]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`${name}: ready`);
  } catch {
    console.error(`${name}: unavailable`);
    failed = true;
  }
}
const proxies = new Set(
  [process.env.CRAWLER_HTTP_PROXY, process.env.CRAWLER_HTTPS_PROXY]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim()),
);
for (const [index, proxy] of [...proxies].entries()) {
  // Keep credentials out of command arguments and diagnostic output.
  const result = spawnSync(
    "curl",
    [
      "--silent",
      "--output",
      "/dev/null",
      "--connect-timeout",
      "8",
      "--max-time",
      "15",
      "--write-out",
      "%{http_connect} %{http_code}",
      "https://example.com",
    ],
    {
      encoding: "utf8",
      timeout: 16000,
      env: {
        ...process.env,
        https_proxy: proxy,
        HTTPS_PROXY: proxy,
        all_proxy: "",
        ALL_PROXY: "",
        no_proxy: "",
        NO_PROXY: "",
      },
    },
  );
  const [connectStatus, originStatus] = (result.stdout || "").trim().split(" ");
  if (result.status === 0 && originStatus === "200") {
    console.log(`Proxy ${index + 1}: HTTPS request succeeded`);
  } else if (connectStatus === "200") {
    console.error(
      `Proxy ${index + 1}: gateway accepted the tunnel, but the target HTTPS request failed or timed out (HTTP ${originStatus || "unavailable"}). Retry or check proxy egress.`,
    );
    failed = true;
  } else {
    console.error(
      `Proxy ${index + 1}: request failed (CONNECT ${connectStatus || "unavailable"}, HTTP ${originStatus || "unavailable"}). Check gateway and credentials.`,
    );
    failed = true;
  }
}
if (!proxies.size) console.log("Proxy: direct connections configured");
console.log(
  "Verify a real local bookmark thumbnail before treating crawler parity as proven.",
);
process.exitCode = failed ? 1 : 0;
