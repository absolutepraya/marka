#!/usr/bin/env bash
set -euo pipefail

if ! command -v mise >/dev/null 2>&1; then
  echo "error: mise is required to run Marka's Node 24 toolchain" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node_version="$(cat "$SCRIPT_DIR/../.nvmrc")"
node_root="$(mise where "node@$node_version")"
if [[ -z "$node_root" || ! -x "$node_root/bin/node" ]]; then
  echo "error: Node 24.18.1 is not installed through Mise" >&2
  exit 1
fi

export PATH="$node_root/bin:$PATH"

if [[ "$(node -p 'process.versions.node')" != "$node_version" ]]; then
  echo "error: expected Node $node_version, got $(node --version)" >&2
  exit 1
fi

exec corepack pnpm "$@"
