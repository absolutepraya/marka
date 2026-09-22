#!/usr/bin/env bash
set -euo pipefail

: "${WT_ROOT_PATH:?WT_ROOT_PATH is required}"
: "${WT_WORKSPACE_PATH:?WT_WORKSPACE_PATH is required}"
: "${WT_PORT_BASE:?WT_PORT_BASE is required}"

root_env="$WT_ROOT_PATH/.env"
workspace_env="$WT_WORKSPACE_PATH/.env"
workspace_data_dir="$WT_WORKSPACE_PATH/.data/local"
refresh_data="${WT_REFRESH_DATA:-false}"
data_source="${WT_DATA_SOURCE:-main}"
workspace_name="${WT_WORKSPACE_NAME:-$(basename "$WT_WORKSPACE_PATH")}"
chrome_port="${MARKA_DEV_CHROME_PORT:-9250}"

[[ -f "$root_env" ]] || {
  echo "error: missing root environment file: $root_env" >&2
  exit 1
}

case "$WT_PORT_BASE" in
  '' | *[!0-9]*)
    echo "error: WT_PORT_BASE must be a non-negative integer" >&2
    exit 1
    ;;
esac

if ! [[ "$chrome_port" =~ ^[0-9]+$ ]]; then
  echo "error: MARKA_DEV_CHROME_PORT must be between 1 and 65535" >&2
  exit 1
fi
if ((10#$chrome_port < 1 || 10#$chrome_port > 65535)); then
  echo "error: MARKA_DEV_CHROME_PORT must be between 1 and 65535" >&2
  exit 1
fi

workspace_slug="$(printf '%s' "$workspace_name" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]_-' '-' | sed 's/^-*//; s/-*$//')"
[[ -n "$workspace_slug" ]] || workspace_slug="worktree"
web_port=$((3000 + WT_PORT_BASE))
meili_index_prefix="${workspace_slug}-${WT_PORT_BASE}_"
tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT

while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    DATA_DIR=* | KARAKEEP_PORT=* | API_URL=* | NEXTAUTH_URL=* | MEILI_ADDR=* | MEILI_MASTER_KEY=* | MEILI_VECTOR_ADDR=* | MEILI_VECTOR_MASTER_KEY=* | MEILI_INDEX_PREFIX=* | BROWSER_WEB_URL=* | BROWSER_WEBSOCKET_URL=* | BROWSERLESS_URL=* | BROWSERLESS_TOKEN=* | BROWSER_CONNECT_ONDEMAND=* | MARKA_DEV_CHROME_PORT=*)
      ;;
    *)
      printf '%s\n' "$line" >>"$tmp_env"
      ;;
  esac
done <"$root_env"

cat >>"$tmp_env" <<ENV
DATA_DIR=$workspace_data_dir
KARAKEEP_PORT=$web_port
API_URL=http://localhost:$web_port
NEXTAUTH_URL=http://localhost:$web_port
MEILI_ADDR=http://127.0.0.1:7700
MEILI_MASTER_KEY=
MEILI_INDEX_PREFIX=$meili_index_prefix
BROWSER_WEB_URL=http://127.0.0.1:$chrome_port
MARKA_DEV_CHROME_PORT=$chrome_port
BROWSER_CONNECT_ONDEMAND=false
ENV

mv "$tmp_env" "$workspace_env"
trap - EXIT

if [[ "$refresh_data" == "true" ]]; then
  if [[ -e "$workspace_data_dir" ]]; then
    backup_dir="${workspace_data_dir}.backups/pre-worktree-isolation-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$(dirname "$backup_dir")"
    mv "$workspace_data_dir" "$backup_dir"
    echo "Backed up previous worktree data to $backup_dir"
  fi
elif [[ "$refresh_data" != "false" ]]; then
  echo "error: WT_REFRESH_DATA must be true or false" >&2
  exit 1
fi

case "$data_source" in
  main)
    if [[ ! -e "$workspace_data_dir" && -d "$WT_ROOT_PATH/.data/local" ]]; then
      mkdir -p "$(dirname "$workspace_data_dir")"
      rsync -a "$WT_ROOT_PATH/.data/local/" "$workspace_data_dir/"
      echo "Copied the main workspace data snapshot to $workspace_data_dir"
    elif [[ -e "$workspace_data_dir" ]]; then
      echo "Preserved existing worktree data at $workspace_data_dir"
    else
      echo "No main workspace data snapshot found; migrations will create an empty database."
    fi
    ;;
  prod)
    echo "Refreshing worktree state from production..."
    NO_COLOR=false "$WT_ROOT_PATH/scripts/run-pnpm.sh" prod:pull-state
    ;;
  *)
    echo "error: WT_DATA_SOURCE must be main or prod" >&2
    exit 1
    ;;
esac

echo "Configured worktree: web $web_port, shared Meilisearch 127.0.0.1:7700, shared Chrome 127.0.0.1:$chrome_port, Meilisearch prefix $meili_index_prefix"
