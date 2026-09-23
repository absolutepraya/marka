#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "usage: bash scripts/dev-worktree.sh {setup|start|stop}" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
action="$1"
workspace_path="${WT_WORKSPACE_PATH:-${T3CODE_WORKTREE_PATH:-$PWD}}"

case "$action" in
  setup)
    : "${WT_ROOT_PATH:?WT_ROOT_PATH is required}"
    : "${WT_WORKSPACE_PATH:?WT_WORKSPACE_PATH is required}"
    : "${WT_PORT_BASE:?WT_PORT_BASE is required}"

    cd "$WT_WORKSPACE_PATH"
    "$SCRIPT_DIR/run-pnpm.sh" install --frozen-lockfile

    ln -sfn ../../.env apps/web/.env
    ln -sfn ../../.env apps/workers/.env
    ln -sfn ../../.env packages/db/.env

    WT_DATA_SOURCE=prod bash "$WT_ROOT_PATH/scripts/setup-worktree.sh"
    NO_COLOR=false "$SCRIPT_DIR/run-pnpm.sh" dev:start -d
    ;;
  start)
    cd "$workspace_path"
    NO_COLOR=false "$SCRIPT_DIR/run-pnpm.sh" dev:start -d
    ;;
  stop)
    cd "$workspace_path"
    NO_COLOR=false "$SCRIPT_DIR/run-pnpm.sh" dev:stop
    ;;
  *)
    usage
    ;;
esac
