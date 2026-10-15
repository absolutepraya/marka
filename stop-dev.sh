#!/usr/bin/env bash
set -euo pipefail

# Stop only the Karakeep web/workers processes for this workspace.
# Shared Meilisearch + renderers are machine-level infrastructure and stay running.

DEV_DIR=".dev"

kill_tree() {
    local pid="$1" child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
}

stop_proc() {
    local name="$1" file="$DEV_DIR/$2" pid
    if [ -f "$file" ]; then
        pid="$(cat "$file" 2>/dev/null)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $name (pid $pid)..."
            kill_tree "$pid"
        else
            echo "$name: not running"
        fi
        rm -f "$file"
    else
        echo "$name: no pidfile (was it started with ./start-dev.sh -d?)"
    fi
}

stop_proc "web app" "web.pid"
stop_proc "workers" "workers.pid"

echo "Done. This workspace is stopped."
echo "Shared Meilisearch + renderers are still running. Stop them explicitly with: pnpm dev:infra:down"
