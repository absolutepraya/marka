#!/usr/bin/env bash
set -euo pipefail

# Karakeep dev launcher.
#   ./start-dev.sh        foreground - logs in this terminal, Ctrl+C stops this workspace
#   ./start-dev.sh -d     detached   - frees the shell, logs in .dev/, stop with ./stop-dev.sh
# Shared Meilisearch + Chrome remain machine-level infrastructure managed by scripts/dev-infra.sh.

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
        grep -m1 "^${key}=" .env 2>/dev/null | cut -d'=' -f2- || true
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

MEILI_ADDR="${MEILI_ADDR:-$(env_value MEILI_ADDR)}"
MEILI_ADDR="${MEILI_ADDR:-http://127.0.0.1:7700}"
DEFAULT_CHROME_PORT=9250
MARKA_DEV_CHROME_PORT="${MARKA_DEV_CHROME_PORT:-$(env_value MARKA_DEV_CHROME_PORT)}"
BROWSER_WEB_URL="${BROWSER_WEB_URL:-$(env_value BROWSER_WEB_URL)}"

# MARKA_DEV_CHROME_PORT is the source of truth for local loopback Chrome. A
# custom non-loopback BROWSER_WEB_URL remains supported for external browser
# services, but local URLs must follow the effective host port.
if [ -z "$MARKA_DEV_CHROME_PORT" ]; then
    if [[ "$BROWSER_WEB_URL" =~ ^http://(127\.0\.0\.1|localhost):([0-9]+)/?$ ]]; then
        MARKA_DEV_CHROME_PORT="${BASH_REMATCH[2]}"
    else
        MARKA_DEV_CHROME_PORT="$DEFAULT_CHROME_PORT"
    fi
fi
if ! [[ "$MARKA_DEV_CHROME_PORT" =~ ^[0-9]+$ ]]; then
    echo "Error: MARKA_DEV_CHROME_PORT must be between 1 and 65535." >&2
    exit 1
fi
if ((10#$MARKA_DEV_CHROME_PORT < 1 || 10#$MARKA_DEV_CHROME_PORT > 65535)); then
    echo "Error: MARKA_DEV_CHROME_PORT must be between 1 and 65535." >&2
    exit 1
fi
if [ -z "$BROWSER_WEB_URL" ] || [[ "$BROWSER_WEB_URL" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+/?$ ]]; then
    BROWSER_WEB_URL="http://127.0.0.1:${MARKA_DEV_CHROME_PORT}"
fi
MEILI_INDEX_PREFIX="${MEILI_INDEX_PREFIX:-$(env_value MEILI_INDEX_PREFIX)}"
MEILI_INDEX_PREFIX="${MEILI_INDEX_PREFIX:-main_}"
unset MEILI_VECTOR_ADDR MEILI_VECTOR_MASTER_KEY
unset BROWSER_WEBSOCKET_URL BROWSERLESS_URL BROWSERLESS_TOKEN
export MEILI_ADDR BROWSER_WEB_URL MARKA_DEV_CHROME_PORT MEILI_INDEX_PREFIX
export BROWSER_CONNECT_ONDEMAND=false

bash "$SCRIPT_DIR/scripts/dev-infra.sh" up

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
export DATA_DIR

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
    echo "Shared Meilisearch and Chrome are still running. Stop them explicitly with: pnpm dev:infra:down"
    exit 0
}

if command_exists nc; then
    echo "Waiting for web app to start..."
    ATTEMPT=0
    while [ $ATTEMPT -lt 30 ]; do
        if nc -z localhost "$WEB_PORT" 2>/dev/null; then
            break
        fi
        sleep 1
        ATTEMPT=$((ATTEMPT + 1))
    done
    if [ $ATTEMPT -eq 30 ]; then
        echo "Warning: Web app may not have started properly after 30 seconds"
    fi
else
    echo "Skipping web readiness probe because 'nc' is not installed."
fi

echo ""
echo "Development environment is running!"
echo "  Web app:            http://localhost:$WEB_PORT"
echo "  Meilisearch:        $MEILI_ADDR"
echo "  Meili index prefix: $MEILI_INDEX_PREFIX"
echo "  Chrome debugger:    $BROWSER_WEB_URL"
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
