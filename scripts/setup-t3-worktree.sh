#!/usr/bin/env bash
set -euo pipefail

: "${T3CODE_PROJECT_ROOT:?T3CODE_PROJECT_ROOT is required}"
: "${T3CODE_WORKTREE_PATH:?T3CODE_WORKTREE_PATH is required}"

cd "$T3CODE_WORKTREE_PATH"

worktree_name="$(basename "$T3CODE_WORKTREE_PATH")"
worktree_checksum="$(printf '%s' "$worktree_name" | cksum | awk '{print $1}')"

# WT worktrees use 3000 + their configured slot offset. Keep T3 worktrees in
# 4000-4999 so they do not collide with the main workspace or WT's slots.
export WT_ROOT_PATH="$T3CODE_PROJECT_ROOT"
export WT_WORKSPACE_PATH="$T3CODE_WORKTREE_PATH"
export WT_WORKSPACE_NAME="$worktree_name"
export WT_PORT_BASE=$((1000 + worktree_checksum % 1000))

mise exec node@24 -- corepack pnpm install --frozen-lockfile

# The setup helper runs migrations during the production-state pull, so create
# the package environment links before invoking it. The root .env is written by
# setup-worktree.sh and the links resolve once that file exists.
ln -sfn ../../.env apps/web/.env
ln -sfn ../../.env apps/workers/.env
ln -sfn ../../.env packages/db/.env

WT_DATA_SOURCE=prod bash "$T3CODE_PROJECT_ROOT/scripts/setup-worktree.sh"
pnpm dev:start -d
