#!/usr/bin/env bash
set -euo pipefail

# Karakeep dev launcher.
#   ./start-dev.sh        foreground - logs in this terminal, Ctrl+C stops this workspace
#   ./start-dev.sh -d     detached   - frees the shell, logs in .dev/, stop with ./stop-dev.sh
# Shared Meilisearch + renderers remain machine-level infrastructure managed by scripts/dev-infra.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETACH=0
case "${1:-}" in
    -d|--detach) DETACH=1 ;;
    -h|--help) echo "Usage: ./start-dev.sh [-d|--detach]"; exit 0 ;;
    "") ;;
    *) echo "Unknown option: $1"; echo "Usage: ./start-dev.sh [-d|--detach]"; exit 1 ;;
esac

DEV_DIR=".dev"
mkdir -p "$DEV_DIR"

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

env_value() {
    local key="$1"
    if [ -f ".env" ]; then
        node -e 'process.loadEnvFile(".env"); process.stdout.write(process.env[process.argv[1]] ?? "")' "$key"
    fi
}

kill_tree() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
}

if ! command_exists docker; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command_exists pnpm; then
    echo "Error: pnpm is not installed. Please install pnpm first."
    exit 1
fi

WEB_PORT="${KARAKEEP_PORT:-$(env_value KARAKEEP_PORT)}"
WEB_PORT="${WEB_PORT:-3000}"
case "$WEB_PORT" in
    ''|*[!0-9]*) echo "Error: KARAKEEP_PORT must be a port number."; exit 1 ;;
esac
if ((10#$WEB_PORT < 1 || 10#$WEB_PORT > 55535)); then
    echo "Error: KARAKEEP_PORT must be between 1 and 55535 (workers use web + 10000)." >&2
    exit 1
fi
if command_exists lsof && lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Error: web port $WEB_PORT is occupied. Stop its owner before starting this workspace." >&2
    exit 1
fi

# Keep all managed services local even when .env originated from a production snapshot.
MEILI_ADDR="http://127.0.0.1:7700"
MEILI_INDEX_PREFIX="${MEILI_INDEX_PREFIX:-$(env_value MEILI_INDEX_PREFIX)}"
if [[ -z "$MEILI_INDEX_PREFIX" && -f "$SCRIPT_DIR/.git" ]]; then
    MEILI_INDEX_PREFIX="$(basename "$SCRIPT_DIR" | tr -cs '[:alnum:]_-' '-')-${WEB_PORT}_"
fi
MEILI_INDEX_PREFIX="${MEILI_INDEX_PREFIX:-main_}"
MARKA_DEV_RENDERER="${MARKA_DEV_RENDERER:-$(env_value MARKA_DEV_RENDERER)}"
MARKA_DEV_RENDERER="${MARKA_DEV_RENDERER:-browserless}"
MARKA_DEV_BROWSERLESS_PORT="${MARKA_DEV_BROWSERLESS_PORT:-$(env_value MARKA_DEV_BROWSERLESS_PORT)}"
MARKA_DEV_BROWSERLESS_PORT="${MARKA_DEV_BROWSERLESS_PORT:-9251}"
MARKA_DEV_CHROME_PORT="${MARKA_DEV_CHROME_PORT:-$(env_value MARKA_DEV_CHROME_PORT)}"
MARKA_DEV_CHROME_PORT="${MARKA_DEV_CHROME_PORT:-9250}"
WORKER_PROFILE="${WORKER_PROFILE:-$(env_value WORKER_PROFILE)}"
WORKER_PROFILE="${WORKER_PROFILE:-screenshot-first}"
case "$WORKER_PROFILE" in
    screenshot-first|full) ;;
    *) echo "Error: WORKER_PROFILE must be screenshot-first or full." >&2; exit 1 ;;
esac
CRAWLER_NUM_WORKERS="${CRAWLER_NUM_WORKERS:-$(env_value CRAWLER_NUM_WORKERS)}"
CRAWLER_NUM_WORKERS="${CRAWLER_NUM_WORKERS:-2}"
BROWSER_REUSE_CONNECTION="${BROWSER_REUSE_CONNECTION:-$(env_value BROWSER_REUSE_CONNECTION)}"
BROWSER_REUSE_CONNECTION="${BROWSER_REUSE_CONNECTION:-false}"
WORKERS_HOST=127.0.0.1
WORKERS_PORT="${WORKERS_PORT:-$(env_value WORKERS_PORT)}"
WORKERS_PORT="${WORKERS_PORT:-$((WEB_PORT + 10000))}"
if ! [[ "$WORKERS_PORT" =~ ^[0-9]+$ ]] || ((10#$WORKERS_PORT < 1 || 10#$WORKERS_PORT > 65535)); then
    echo "Error: WORKERS_PORT must be between 1 and 65535." >&2
    exit 1
fi
if command_exists lsof && lsof -nP -iTCP:"$WORKERS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Error: worker port $WORKERS_PORT is occupied. Stop its owner before starting this workspace." >&2
    exit 1
fi
export MEILI_ADDR MEILI_INDEX_PREFIX WORKER_PROFILE CRAWLER_NUM_WORKERS
export MARKA_DEV_RENDERER MARKA_DEV_BROWSERLESS_PORT MARKA_DEV_CHROME_PORT
export WORKERS_HOST WORKERS_PORT BROWSER_REUSE_CONNECTION
export MEILI_MASTER_KEY="" MEILI_VECTOR_ADDR="" MEILI_VECTOR_MASTER_KEY=""
export BROWSER_CONNECT_ONDEMAND=true
# Terminal launchers commonly supply NO_COLOR=1; shared config expects booleans.
case "${NO_COLOR:-}" in
    1) export NO_COLOR=true ;;
    0|"") export NO_COLOR=false ;;
esac
export API_URL="http://localhost:$WEB_PORT" NEXTAUTH_URL="http://localhost:$WEB_PORT"

bash "$SCRIPT_DIR/scripts/dev-infra.sh" up
case "$MARKA_DEV_RENDERER" in
    browserless)
        BROWSERLESS_URL="ws://127.0.0.1:$MARKA_DEV_BROWSERLESS_PORT"
        BROWSERLESS_TOKEN="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' marka-dev-browserless | sed -n 's/^TOKEN=//p')"
        [[ -n "$BROWSERLESS_TOKEN" ]] || { echo "Error: local Browserless token is missing." >&2; exit 1; }
        export BROWSERLESS_URL BROWSERLESS_TOKEN
        export BROWSER_WEB_URL="" BROWSER_WEBSOCKET_URL=""
        ;;
    chrome)
        if [[ -n "$(env_value BROWSERLESS_URL)" || -n "$(env_value BROWSERLESS_TOKEN)" ]]; then
            echo "Error: remove Browserless settings from local .env before selecting legacy Chrome." >&2
            exit 1
        fi
        unset BROWSERLESS_URL BROWSERLESS_TOKEN
        export BROWSER_WEB_URL="http://127.0.0.1:${MARKA_DEV_CHROME_PORT}" BROWSER_WEBSOCKET_URL=""
        ;;
esac

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Keep the database location absolute and shared across the package cwd
# changes used by the migration, web, and worker commands.
if [ -z "${DATA_DIR:-}" ]; then
    DATA_DIR="$(env_value DATA_DIR)"
fi
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/.data/local}"
if [[ "$DATA_DIR" != /* ]]; then
    DATA_DIR="$SCRIPT_DIR/$DATA_DIR"
fi
DATA_DIR="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$DATA_DIR")"
case "$DATA_DIR" in
    "$SCRIPT_DIR"/*) ;;
    *) echo "Error: managed dev DATA_DIR must be inside this workspace. Configure .data/local in local .env." >&2; exit 1 ;;
esac
export DATA_DIR
export ASSETS_DIR="$DATA_DIR/assets"
# Imported state must not redirect local asset writes to a production S3 store.
export ASSET_STORE_S3_ENDPOINT=""

if [ ! -d "$DATA_DIR" ]; then
    echo "Creating DATA_DIR at $DATA_DIR..."
    mkdir -p "$DATA_DIR"
fi

echo "Running database migrations..."
pnpm run db:migrate

echo "Starting web app and workers..."
if [ "$DETACH" -eq 1 ]; then
    nohup pnpm --filter @karakeep/web exec next dev --port "$WEB_PORT" > "$DEV_DIR/web.log" 2>&1 & WEB_PID=$!
    nohup pnpm workers > "$DEV_DIR/workers.log" 2>&1 & WORKERS_PID=$!
else
    pnpm --filter @karakeep/web exec next dev --port "$WEB_PORT" & WEB_PID=$!
    pnpm workers & WORKERS_PID=$!
fi
echo "$WEB_PID" > "$DEV_DIR/web.pid"
echo "$WORKERS_PID" > "$DEV_DIR/workers.pid"

cleanup() {
    echo ""
    echo "Shutting down this workspace..."
    kill_tree "$WEB_PID"
    kill_tree "$WORKERS_PID"
    rm -f "$DEV_DIR/web.pid" "$DEV_DIR/workers.pid"
    echo "Shared Meilisearch and renderers are still running. Stop them explicitly with: pnpm dev:infra:down"
    exit 0
}

startup_failed() {
    echo "Error: $* See $DEV_DIR/web.log and $DEV_DIR/workers.log." >&2
    kill_tree "$WEB_PID"
    kill_tree "$WORKERS_PID"
    rm -f "$DEV_DIR/web.pid" "$DEV_DIR/workers.pid"
    exit 1
}
trap cleanup SIGINT SIGTERM
command_exists curl || startup_failed "curl is required for readiness checks."
echo "Waiting for web and workers to become ready..."
ready=false
for ((attempt=0; attempt<120; attempt++)); do
    kill -0 "$WEB_PID" 2>/dev/null || startup_failed "Web process exited during startup."
    kill -0 "$WORKERS_PID" 2>/dev/null || startup_failed "Workers process exited during startup."
    if curl --fail --silent --connect-timeout 1 --max-time 2 "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null && \
       curl --fail --silent --connect-timeout 1 --max-time 2 "http://127.0.0.1:$WORKERS_PORT/ready" >/dev/null; then
        ready=true
        break
    fi
    sleep 1
done
[[ "$ready" == true ]] || startup_failed "Web or workers did not become ready."

echo ""
echo "Development environment is running!"
echo "  Web app:            http://localhost:$WEB_PORT"
echo "  Meilisearch:        $MEILI_ADDR"
echo "  Meili index prefix: $MEILI_INDEX_PREFIX"
echo "  Renderer:           $MARKA_DEV_RENDERER (local only)"
echo "  Worker profile:     $WORKER_PROFILE"
echo "  Crawler concurrency: $CRAWLER_NUM_WORKERS per queue"
echo "  Connection reuse:   $BROWSER_REUSE_CONNECTION"
echo "  Worker readiness:   http://127.0.0.1:$WORKERS_PORT/ready"
echo "  Shared infra:       pnpm dev:infra:status"

if [ "$DETACH" -eq 1 ]; then
    echo ""
    echo "Running detached (your shell is free)."
    echo "  Logs:  tail -f $DEV_DIR/web.log $DEV_DIR/workers.log"
    echo "  Stop this workspace: ./stop-dev.sh"
    exit 0
else
    trap cleanup SIGINT SIGTERM
    echo "  Press Ctrl+C to stop this workspace (shared infra stays running)"
    wait
fi
