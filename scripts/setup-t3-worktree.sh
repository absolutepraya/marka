#!/usr/bin/env bash
set -euo pipefail

: "${T3CODE_PROJECT_ROOT:?T3CODE_PROJECT_ROOT is required}"
: "${T3CODE_WORKTREE_PATH:?T3CODE_WORKTREE_PATH is required}"

cd "$T3CODE_WORKTREE_PATH"

worktree_name="$(basename "$T3CODE_WORKTREE_PATH")"
registry_file="${T3_PORT_REGISTRY_FILE:-$T3CODE_PROJECT_ROOT/.dev/t3-ports.tsv}"
registry_lock="${registry_file}.lock"
registry_lock_owned=false
registry_tmp=""

cleanup_registry() {
  if [[ "$registry_lock_owned" == true ]]; then
    rm -f "$registry_lock/pid"
    rmdir "$registry_lock" 2>/dev/null || true
  fi
  if [[ -n "$registry_tmp" ]]; then
    rm -f "$registry_tmp"
  fi
}
trap cleanup_registry EXIT INT TERM

acquire_registry_lock() {
  local attempt=0
  local lock_pid=""

  mkdir -p "$(dirname "$registry_file")"
  while ((attempt < 600)); do
    if mkdir "$registry_lock" 2>/dev/null; then
      printf '%s\n' "$$" >"$registry_lock/pid"
      registry_lock_owned=true
      return
    fi

    if [[ -f "$registry_lock/pid" ]]; then
      lock_pid="$(cat "$registry_lock/pid")"
      if [[ "$lock_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
        rm -f "$registry_lock/pid"
        rmdir "$registry_lock" 2>/dev/null || true
        continue
      fi
    fi

    attempt=$((attempt + 1))
    sleep 0.1
  done

  echo "error: timed out waiting for T3 port registry lock: $registry_lock" >&2
  exit 1
}

registry_has_port() {
  local file="$1"
  local port="$2"
  [[ -f "$file" ]] || return 1
  awk -F '\t' -v port="$port" '$1 == port { found = 1 } END { exit found ? 0 : 1 }' "$file"
}

port_is_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .
    return
  fi

  return 1
}

allocate_t3_port() {
  local port_min=4000
  local port_max=4999
  local assigned_port=""
  local candidate=""
  local port=""
  local path=""

  acquire_registry_lock
  registry_tmp="$(mktemp "${registry_file}.tmp.XXXXXX")"

  if [[ -f "$registry_file" ]]; then
    while IFS=$'\t' read -r port path || [[ -n "$port$path" ]]; do
      [[ "$port" =~ ^[0-9]+$ ]] || continue
      ((port >= port_min && port <= port_max)) || continue
      [[ -n "$path" && -d "$path" ]] || continue
      registry_has_port "$registry_tmp" "$port" && continue

      if [[ "$path" == "$T3CODE_WORKTREE_PATH" && -z "$assigned_port" ]]; then
        assigned_port="$port"
      fi
      printf '%s\t%s\n' "$port" "$path" >>"$registry_tmp"
    done <"$registry_file"
  fi

  if [[ -z "$assigned_port" ]]; then
    for candidate in $(seq 4000 4999); do
      registry_has_port "$registry_tmp" "$candidate" && continue
      port_is_in_use "$candidate" && continue
      assigned_port="$candidate"
      printf '%s\t%s\n' "$assigned_port" "$T3CODE_WORKTREE_PATH" >>"$registry_tmp"
      break
    done
  fi

  if [[ -z "$assigned_port" ]]; then
    echo "error: no free T3 web port is available in $port_min to $port_max" >&2
    exit 1
  fi

  mv "$registry_tmp" "$registry_file"
  registry_tmp=""
  registry_lock_owned=false
  rm -f "$registry_lock/pid"
  rmdir "$registry_lock"

  printf '%s\n' "$assigned_port"
}

# WT worktrees use 3000 plus their configured slot offset. Keep T3 worktrees in
# 4000 to 4999 so they do not collide with the main workspace or WT's slots.
export WT_ROOT_PATH="$T3CODE_PROJECT_ROOT"
export WT_WORKSPACE_PATH="$T3CODE_WORKTREE_PATH"
export WT_WORKSPACE_NAME="$worktree_name"

t3_port="$(allocate_t3_port)"
export WT_PORT_BASE=$((t3_port - 3000))

# Keep dependency, environment, production-state, and dev-server setup aligned
# with WT through the shared repository lifecycle script.
bash "$T3CODE_PROJECT_ROOT/scripts/dev-worktree.sh" setup
