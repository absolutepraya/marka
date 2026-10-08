import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const binary = resolve("apps/cli/dist/index.mjs");
test("built help uses Marka", async () => {
  const { stdout } = await execute(process.execPath, [binary, "--help"]);
  assert.match(stdout, /Usage: marka/);
});
test("missing credentials fail with setup guidance", async () => {
  const config = await mkdtemp(join(tmpdir(), "marka-auth-"));
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  delete env.KARAKEEP_API_KEY;
  try {
    await assert.rejects(
      execute(process.execPath, [binary, "whoami"], { env }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Marka is not authenticated/);
        assert.match(error.stderr, /marka auth init/);
        return true;
      },
    );
  } finally {
    await rm(config, { recursive: true, force: true });
  }
});
test("401 response fails with authentication recovery guidance", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify([
        {
          error: {
            json: {
              message: "Unauthorized",
              code: -32001,
              data: {
                code: "UNAUTHORIZED",
                httpStatus: 401,
                path: "users.whoami",
              },
            },
          },
        },
      ]),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const env = {
    ...process.env,
    KARAKEEP_API_KEY: "test-only-invalid-key",
    KARAKEEP_SERVER_ADDR: `http://127.0.0.1:${server.address().port}`,
  };
  try {
    await assert.rejects(
      execute(process.execPath, [binary, "whoami"], { env }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Marka authentication failed/);
        assert.doesNotMatch(error.stderr, /test-only-invalid-key/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
