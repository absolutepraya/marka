#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REAL_NODE="$(command -v node)"
root="$(mktemp -d)"
cleanup() {
  if [[ -d "$root/project/.dev" ]]; then (cd "$root/project" && bash ./stop-dev.sh >/dev/null 2>&1) || true; fi
  rm -rf "$root"
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
mkdir -p "$root/bin" "$root/project/scripts" "$root/project/node_modules"
cp "$REPO_ROOT/start-dev.sh" "$REPO_ROOT/stop-dev.sh" "$root/project/"
cat >"$root/project/scripts/dev-infra.sh" <<'EOF'
#!/usr/bin/env bash
printf 'infra:%s\n' "$MARKA_DEV_RENDERER" >>"$DEV_TEST_LOG"
EOF
cat >"$root/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf 'TOKEN=local-test-token\n'
EOF
cat >"$root/bin/lsof" <<'EOF'
#!/usr/bin/env bash
[[ "${DEV_TEST_BUSY:-false}" == true ]]
EOF
cat >"$root/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *'/ready'* && ( "${DEV_TEST_NOT_READY:-false}" == true || "${DEV_TEST_WORKER_EXIT:-false}" == true ) ]]; then exit 22; fi
exit 0
EOF
cat >"$root/bin/sleep" <<'EOF'
#!/usr/bin/env bash
/bin/sleep 0.001
EOF
cat >"$root/bin/pnpm" <<'EOF'
#!/usr/bin/env bash
set -eu
printf 'pnpm:%s\n' "$*" >>"$DEV_TEST_LOG"
[[ "$*" != 'run db:migrate' ]] || exit 0
if [[ "$1" == workers ]]; then
  "$REAL_NODE" -e 'const keys=["DATA_DIR","ASSETS_DIR","API_URL","NEXTAUTH_URL","MEILI_ADDR","MEILI_MASTER_KEY","MEILI_INDEX_PREFIX","BROWSERLESS_URL","BROWSERLESS_TOKEN","BROWSER_WEB_URL","BROWSER_WEBSOCKET_URL","BROWSER_CONNECT_ONDEMAND","BROWSER_REUSE_CONNECTION","CRAWLER_NUM_WORKERS","WORKER_PROFILE","WORKERS_PORT","ASSET_STORE_S3_ENDPOINT","NO_COLOR"]; require("node:fs").writeFileSync(process.env.DEV_TEST_ENV,JSON.stringify(Object.fromEntries(keys.map(k=>[k,process.env[k]]))));'
  [[ "${DEV_TEST_WORKER_EXIT:-false}" != true ]] || exit 7
fi
exec /bin/sleep 120
EOF
chmod +x "$root/bin/"* "$root/project/scripts/dev-infra.sh"
export PATH="$root/bin:$(dirname "$REAL_NODE"):$PATH" REAL_NODE
export DEV_TEST_LOG="$root/calls.log" DEV_TEST_ENV="$root/runtime.json"
cat >"$root/project/.env" <<EOF
DATA_DIR="$root/project/.data/local"
ASSETS_DIR=/production/assets
ASSET_STORE_S3_ENDPOINT=https://production-storage.invalid
KARAKEEP_PORT=4017
API_URL=https://production.invalid
NEXTAUTH_URL=https://production.invalid
MEILI_ADDR=https://production-search.invalid
MEILI_MASTER_KEY=production-secret
MEILI_INDEX_PREFIX=fixture_
BROWSER_WEB_URL=http://production-renderer.invalid
BROWSER_WEBSOCKET_URL=ws://production-renderer.invalid
BROWSERLESS_URL=https://production-renderer.invalid
BROWSERLESS_TOKEN=production-secret
BROWSER_CONNECT_ONDEMAND=false
BROWSER_REUSE_CONNECTION=true
WORKER_PROFILE=screenshot-first
EOF
(cd "$root/project" && NO_COLOR=1 bash ./start-dev.sh -d) >"$root/success.log" 2>&1
"$REAL_NODE" - "$DEV_TEST_ENV" "$root/project" <<'JS'
const assert=require('node:assert/strict');const fs=require('node:fs');const e=JSON.parse(fs.readFileSync(process.argv[2]));const root=process.argv[3];
assert.equal(e.NO_COLOR,'true');assert.equal(e.DATA_DIR,root+'/.data/local');assert.equal(e.ASSETS_DIR,root+'/.data/local/assets');assert.equal(e.ASSET_STORE_S3_ENDPOINT,'');
assert.equal(e.API_URL,'http://localhost:4017');assert.equal(e.NEXTAUTH_URL,e.API_URL);assert.equal(e.MEILI_ADDR,'http://127.0.0.1:7700');assert.equal(e.MEILI_MASTER_KEY,'');assert.equal(e.MEILI_INDEX_PREFIX,'fixture_');
assert.equal(e.BROWSERLESS_URL,'ws://127.0.0.1:9251');assert.equal(e.BROWSERLESS_TOKEN,'local-test-token');assert.equal(e.BROWSER_WEB_URL,'');assert.equal(e.BROWSER_WEBSOCKET_URL,'');assert.equal(e.BROWSER_CONNECT_ONDEMAND,'true');assert.equal(e.BROWSER_REUSE_CONNECTION,'true');assert.equal(e.CRAWLER_NUM_WORKERS,'2');assert.equal(e.WORKER_PROFILE,'screenshot-first');assert.equal(e.WORKERS_PORT,'14017');
JS
if grep -Eq 'production-secret|local-test-token' "$root/success.log"; then fail 'Startup leaked a token'; fi
(cd "$root/project" && bash ./stop-dev.sh) >/dev/null
if (cd "$root/project" && DEV_TEST_NOT_READY=true bash ./start-dev.sh -d) >"$root/not-ready.log" 2>&1; then fail 'Startup accepted unready workers'; fi
[[ ! -e "$root/project/.dev/workers.pid" ]] || fail 'Failed startup retained worker PID'
if grep -Fq 'Development environment is running!' "$root/not-ready.log"; then fail 'Failed startup reported success'; fi
if (cd "$root/project" && DEV_TEST_WORKER_EXIT=true bash ./start-dev.sh -d) >"$root/exited.log" 2>&1; then fail 'Startup accepted crashed workers'; fi
if (cd "$root/project" && DEV_TEST_BUSY=true bash ./start-dev.sh -d) >"$root/busy.log" 2>&1; then fail 'Startup reused an occupied port'; fi
if (cd "$root/project" && WORKER_PROFILE=invalid bash ./start-dev.sh -d) >"$root/profile.log" 2>&1; then fail 'Startup accepted unknown profile'; fi
if (cd "$root/project" && DATA_DIR=/production/data bash ./start-dev.sh -d) >"$root/data.log" 2>&1; then fail 'Startup accepted data outside the workspace'; fi
printf 'Dev launcher isolation and readiness tests passed.\n'
