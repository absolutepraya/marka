#!/usr/bin/env bash
set -euo pipefail

if ! command -v mise >/dev/null 2>&1; then
  echo "error: mise is required to run Marka's Node 24 toolchain" >&2
  exit 1
fi

node_root="$(mise where node@24)"
if [[ -z "$node_root" || ! -x "$node_root/bin/node" ]]; then
  echo "error: Node 24.18.1 is not installed through Mise" >&2
  exit 1
fi

export PATH="$node_root/bin:$PATH"

if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "24" ]]; then
  echo "error: expected Node 24, got $(node --version)" >&2
  exit 1
fi

exec corepack pnpm "$@"
