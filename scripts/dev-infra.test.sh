#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA="$SCRIPT_DIR/dev-infra.sh"
SETUP_WORKTREE="$SCRIPT_DIR/setup-worktree.sh"
DEV_WORKTREE="$SCRIPT_DIR/dev-worktree.sh"
WT_CONFIG="$REPO_ROOT/.wt/config.toml"
T3_JSON="$REPO_ROOT/t3.json"
START_DEV="$REPO_ROOT/start-dev.sh"
STOP_DEV="$REPO_ROOT/stop-dev.sh"
PACKAGE_JSON="$REPO_ROOT/package.json"
DEV_COMPOSE="$REPO_ROOT/docker/docker-compose.dev.yml"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file_or_text="$1" expected="$2"
  if [[ -f "$file_or_text" ]]; then
    grep -Fq -- "$expected" "$file_or_text" || fail "Expected '$expected' in $file_or_text"
  else
    grep -Fq -- "$expected" <<<"$file_or_text" || fail "Expected '$expected' in output"
  fi
}

assert_not_contains() {
  local file_or_text="$1" unexpected="$2"
  if [[ -f "$file_or_text" ]]; then
    ! grep -Fq -- "$unexpected" "$file_or_text" || fail "Did not expect '$unexpected' in $file_or_text"
  else
    ! grep -Fq -- "$unexpected" <<<"$file_or_text" || fail "Did not expect '$unexpected' in output"
  fi
}

assert_symlink_target() {
  local link="$1" expected="$2"
  [[ -L "$link" ]] || fail "Expected a symlink at $link"
  [[ "$(readlink "$link")" == "$expected" ]] || fail "Expected $link to target $expected"
}

root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fake_bin="$root/bin"
state_dir="$root/docker-state"
mkdir -p "$fake_bin" "$state_dir"

cat >"$fake_bin/docker" <<'EOF_DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
state_dir="${FAKE_DOCKER_STATE:?}"
log="${FAKE_DOCKER_LOG:?}"
printf '%q ' "$@" >>"$log"
printf '\n' >>"$log"

case "${1:-}" in
  info)
    exit 0
    ;;
  inspect)
    if [[ "${2:-}" == "-f" ]]; then
      name="${4:-}"
      [[ -f "$state_dir/$name" ]] || exit 1
      if [[ "$3" == *"HostConfig.PortBindings"* || "$3" == *"9222/tcp"* ]]; then
        printf '%s\n' "$(sed -n '2p' "$state_dir/$name")"
      else
        printf '%s\n' "$(head -n 1 "$state_dir/$name")"
      fi
      exit 0
    fi
    name="${2:-}"
    [[ -f "$state_dir/$name" ]]
    ;;
  start)
    name="${2:?}"
    [[ -f "$state_dir/$name" ]] || exit 1
    port="$(sed -n '2p' "$state_dir/$name")"
    printf 'true\n%s\n' "$port" >"$state_dir/$name"
    ;;
  run)
    name=""
    args=("$@")
    for ((i = 1; i < ${#args[@]}; i++)); do
      if [[ "${args[$i]}" == "--name" ]]; then
        name="${args[$((i + 1))]}"
        break
      fi
    done
    [[ -n "$name" ]] || exit 2
    port=""
    for ((i = 1; i < ${#args[@]}; i++)); do
      if [[ "${args[$i]}" == "-p" ]]; then
        port="${args[$((i + 1))]#*:}"
        port="${port%%:*}"
        break
      fi
    done
    printf 'true\n%s\n' "$port" >"$state_dir/$name"
    printf 'fake-container-id\n'
    ;;
  rm)
    name="${@: -1}"
    rm -f "$state_dir/$name"
    ;;
  rename)
    old="${2:?}"
    new="${3:?}"
    mv "$state_dir/$old" "$state_dir/$new"
    ;;
  ps)
    for file in "$state_dir"/*; do
      [[ -e "$file" ]] || continue
      if [[ "$(cat "$file")" == "true" ]]; then
        basename "$file"
      fi
    done
    ;;
  *)
    exit 0
    ;;
esac
EOF_DOCKER
chmod +x "$fake_bin/docker"

cat >"$fake_bin/lsof" <<'EOF_LSOF'
#!/usr/bin/env bash
set -Eeuo pipefail
port=""
for arg in "$@"; do
  case "$arg" in
    -iTCP:*) port="${arg#-iTCP:}" ;;
    -i:*) port="${arg#-i:}" ;;
  esac
done
case ",${FAKE_BUSY_PORTS:-}," in
  *",$port,"*) exit 0 ;;
  *) exit 1 ;;
esac
EOF_LSOF
chmod +x "$fake_bin/lsof"

export PATH="$fake_bin:$PATH"
export FAKE_DOCKER_STATE="$state_dir"
export FAKE_DOCKER_LOG="$root/docker.log"
: >"$FAKE_DOCKER_LOG"

[[ -f "$INFRA" ]] || fail "Missing scripts/dev-infra.sh"
for script in "$INFRA" "$SETUP_WORKTREE" "$DEV_WORKTREE" "$START_DEV" "$STOP_DEV"; do
  bash -n "$script"
done
assert_contains "$WT_CONFIG" 'scripts/dev-worktree.sh\" setup'
assert_contains "$WT_CONFIG" 'scripts/dev-worktree.sh\" stop'
assert_contains "$T3_JSON" 'bash scripts/dev-worktree.sh start'
assert_contains "$T3_JSON" 'bash scripts/dev-worktree.sh stop'
assert_contains "$SCRIPT_DIR/setup-t3-worktree.sh" 'scripts/dev-worktree.sh" setup'
assert_contains "$DEV_WORKTREE" 'run-pnpm.sh" install --frozen-lockfile'
assert_contains "$DEV_WORKTREE" 'run-pnpm.sh" dev:start -d'
assert_contains "$DEV_WORKTREE" 'run-pnpm.sh" dev:stop'

# Invalid Chrome ports are rejected before Docker startup.
for invalid_port in 0 65536 abc; do
  if MARKA_DEV_CHROME_PORT="$invalid_port" bash "$INFRA" up >"$root/invalid-$invalid_port.out" 2>&1; then
    fail "Invalid Chrome port $invalid_port was accepted"
  fi
  assert_contains "$root/invalid-$invalid_port.out" "between 1 and 65535"
done

# Shared infra starts exactly one stable Meilisearch and Chrome container.
bash "$INFRA" up >/dev/null
assert_contains "$FAKE_DOCKER_LOG" "marka-dev-meilisearch"
assert_contains "$FAKE_DOCKER_LOG" "127.0.0.1:7700:7700"
assert_contains "$FAKE_DOCKER_LOG" "getmeili/meilisearch:v1.41.0"
assert_contains "$FAKE_DOCKER_LOG" "marka-dev-chrome"
assert_contains "$FAKE_DOCKER_LOG" "127.0.0.1:9250:9222"
assert_contains "$FAKE_DOCKER_LOG" "ghcr.io/karakeep-app/karakeep-chrome:release"

# A worktree can move Chrome to a different host port when another local
# browser debugger owns the default port.
bash "$INFRA" down >/dev/null
: >"$FAKE_DOCKER_LOG"
MARKA_DEV_CHROME_PORT=9251 bash "$INFRA" up >/dev/null
assert_contains "$FAKE_DOCKER_LOG" "127.0.0.1:9251:9222"

# Changing the configured port without explicitly recreating shared Chrome
# fails instead of reporting an endpoint that does not match Docker.
if MARKA_DEV_CHROME_PORT=9252 bash "$INFRA" up >"$root/mismatch.out" 2>&1; then
  fail "Shared infra unexpectedly reused Chrome with a mismatched port mapping"
fi
assert_contains "$root/mismatch.out" "mapped to host port 9251"

first_run_count="$(grep -c '^run ' "$FAKE_DOCKER_LOG" || true)"
MARKA_DEV_CHROME_PORT=9251 bash "$INFRA" up >/dev/null
second_run_count="$(grep -c '^run ' "$FAKE_DOCKER_LOG" || true)"
[[ "$first_run_count" == "$second_run_count" ]] || fail "Repeated infra up created duplicate containers"

# A foreign listener blocks creation instead of being silently reused.
rm -f "$state_dir/marka-dev-meilisearch" "$state_dir/marka-dev-chrome"
: >"$FAKE_DOCKER_LOG"
if FAKE_BUSY_PORTS=7700 bash "$INFRA" up >"$root/foreign.out" 2>&1; then
  fail "Shared infra unexpectedly reused a foreign listener on port 7700"
fi
assert_contains "$root/foreign.out" "Port 7700 is already in use"

# Existing pre-Marka containers are adopted without treating their ports as foreign.
: >"$FAKE_DOCKER_LOG"
printf 'true\n' >"$state_dir/karakeep-dev-meilisearch"
printf 'true\n9222\n' >"$state_dir/karakeep-dev-chrome"
bash "$INFRA" up >/dev/null
assert_contains "$FAKE_DOCKER_LOG" "rename karakeep-dev-meilisearch marka-dev-meilisearch"
assert_contains "$FAKE_DOCKER_LOG" "rename karakeep-dev-chrome marka-dev-chrome"
assert_contains "$FAKE_DOCKER_LOG" "rm -f marka-dev-chrome"
assert_contains "$FAKE_DOCKER_LOG" "127.0.0.1:9250:9222"
[[ -e "$state_dir/marka-dev-meilisearch" ]] || fail "Meilisearch state was not renamed"
[[ -e "$state_dir/marka-dev-chrome" ]] || fail "Chrome state was not renamed"
[[ ! -e "$state_dir/karakeep-dev-meilisearch" ]] || fail "Legacy Meilisearch state remains"
[[ ! -e "$state_dir/karakeep-dev-chrome" ]] || fail "Legacy Chrome state remains"

# Worktrees share infra endpoints but retain unique web/data state and a Meilisearch-safe namespace.
main_root="$root/main"
workspace="$root/worktree"
mkdir -p "$main_root" "$workspace"
cat >"$main_root/.env" <<'EOF_ROOT_ENV'
NEXTAUTH_SECRET=dev-secret
MEILI_ADDR=https://old-meili.example
MEILI_MASTER_KEY=old-meili-secret
MEILI_VECTOR_ADDR=https://old-vector.example
MEILI_VECTOR_MASTER_KEY=old-vector-secret
BROWSER_WEB_URL=http://localhost:9333
BROWSER_WEBSOCKET_URL=ws://localhost:9334
BROWSERLESS_URL=https://old-browserless.example
BROWSERLESS_TOKEN=old-browserless-secret
BROWSER_CONNECT_ONDEMAND=true
EOF_ROOT_ENV

for invalid_port in 0 65536 abc; do
  if MARKA_DEV_CHROME_PORT="$invalid_port" \
    WT_ROOT_PATH="$main_root" \
    WT_WORKSPACE_PATH="$workspace" \
    WT_WORKSPACE_NAME='InvalidPort' \
    WT_PORT_BASE=7 \
    "$SETUP_WORKTREE" >"$root/setup-invalid-$invalid_port.out" 2>&1; then
    fail "Worktree setup accepted invalid Chrome port $invalid_port"
  fi
  assert_contains "$root/setup-invalid-$invalid_port.out" "between 1 and 65535"
done

WT_ROOT_PATH="$main_root" \
WT_WORKSPACE_PATH="$workspace" \
WT_WORKSPACE_NAME='Issue/ABC.weird' \
WT_PORT_BASE=7 \
MARKA_DEV_CHROME_PORT=9250 \
"$SETUP_WORKTREE" >/dev/null
assert_contains "$workspace/.env" "KARAKEEP_PORT=3007"
assert_contains "$workspace/.env" "DATA_DIR=$workspace/.data/local"
assert_contains "$workspace/.env" "MEILI_ADDR=http://127.0.0.1:7700"
assert_contains "$workspace/.env" "MEILI_MASTER_KEY="
assert_contains "$workspace/.env" "BROWSER_WEB_URL=http://127.0.0.1:9250"
assert_not_contains "$workspace/.env" "BROWSER_WEB_URL=http://localhost:9250"
assert_contains "$workspace/.env" "MARKA_DEV_CHROME_PORT=9250"
assert_contains "$workspace/.env" "BROWSER_CONNECT_ONDEMAND=false"
assert_contains "$workspace/.env" "MEILI_INDEX_PREFIX=issue-abc-weird-7_"
assert_not_contains "$workspace/.env" "MEILI_INDEX_PREFIX=issue-abc.weird-7_"
assert_not_contains "$workspace/.env" "old-meili.example"
assert_not_contains "$workspace/.env" "old-meili-secret"
assert_not_contains "$workspace/.env" "old-vector.example"
assert_not_contains "$workspace/.env" "old-vector-secret"
assert_not_contains "$workspace/.env" "old-browserless.example"
assert_not_contains "$workspace/.env" "old-browserless-secret"
assert_not_contains "$workspace/.env" "http://localhost:9333"
assert_not_contains "$workspace/.env" "ws://localhost:9334"
assert_not_contains "$workspace/.env" "http://localhost:7707"
assert_not_contains "$workspace/.env" "http://localhost:9229"

# Workspace lifecycle delegates shared infra startup, pins service selection, and never tears it down implicitly.
assert_contains "$START_DEV" 'scripts/dev-infra.sh" up'
assert_contains "$START_DEV" "DEFAULT_CHROME_PORT=9250"
assert_contains "$START_DEV" 'BASH_REMATCH[2]'
assert_contains "$START_DEV" 'BROWSER_WEB_URL="http://127.0.0.1:${MARKA_DEV_CHROME_PORT}"'
assert_contains "$START_DEV" "unset MEILI_VECTOR_ADDR MEILI_VECTOR_MASTER_KEY"
assert_contains "$START_DEV" "unset BROWSER_WEBSOCKET_URL BROWSERLESS_URL BROWSERLESS_TOKEN"
assert_contains "$START_DEV" "export BROWSER_CONNECT_ONDEMAND=false"
assert_not_contains "$START_DEV" "gcr.io/zenika-hub/alpine-chrome:124"
assert_not_contains "$STOP_DEV" 'docker stop "$MEILI_CONTAINER"'
assert_not_contains "$STOP_DEV" 'docker stop "$CHROME_CONTAINER"'
assert_not_contains "$STOP_DEV" 'docker rm "$MEILI_CONTAINER"'
assert_not_contains "$STOP_DEV" 'docker rm "$CHROME_CONTAINER"'
assert_contains "$DEV_COMPOSE" "127.0.0.1:9222:9222"
assert_not_contains "$DEV_COMPOSE" "- 9222:9222"
assert_contains "$PACKAGE_JSON" '"dev:infra:up": "bash scripts/dev-infra.sh up"'
assert_contains "$PACKAGE_JSON" '"dev:infra:status": "bash scripts/dev-infra.sh status"'
assert_contains "$PACKAGE_JSON" '"dev:infra:down": "bash scripts/dev-infra.sh down"'

# WT and T3 delegate dependency, environment, production-state, and server
# setup to the same repository-owned lifecycle script.
cat >"$fake_bin/mise" <<'EOF_MISE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'mise:%s|%s\n' "$*" "$PWD" >>"${LIFECYCLE_LOG:?}"
if [[ "${1:-}" == where && "${2:-}" == node@24 ]]; then
  printf '%s\n' "${FAKE_NODE_ROOT:?}"
fi
EOF_MISE
cat >"$fake_bin/corepack" <<'EOF_COREPACK'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${1:-}" == pnpm ]] || exit 2
shift
printf 'pnpm:%s|%s\n' "$*" "$PWD" >>"${LIFECYCLE_LOG:?}"
EOF_COREPACK
fake_node_root="$root/node24"
mkdir -p "$fake_node_root/bin"
cat >"$fake_node_root/bin/node" <<'EOF_NODE'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == -p ]]; then
  printf '24\n'
elif [[ "${1:-}" == --version ]]; then
  printf 'v24.18.1\n'
else
  exit 2
fi
EOF_NODE
chmod +x "$fake_bin/mise" "$fake_bin/corepack" "$fake_node_root/bin/node"
export FAKE_NODE_ROOT="$fake_node_root"

make_fake_project() {
  local project_root="$1"
  mkdir -p "$project_root/scripts"
  cat >"$project_root/scripts/setup-worktree.sh" <<'EOF_SETUP'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'state:%s|%s|%s|%s\n' "$WT_DATA_SOURCE" "$WT_ROOT_PATH" "$WT_WORKSPACE_PATH" "$WT_PORT_BASE" >>"${LIFECYCLE_LOG:?}"
EOF_SETUP
  cp "$DEV_WORKTREE" "$project_root/scripts/dev-worktree.sh"
  cp "$SCRIPT_DIR/run-pnpm.sh" "$project_root/scripts/run-pnpm.sh"
}

make_fake_workspace() {
  mkdir -p "$1/apps/web" "$1/apps/workers" "$1/packages/db"
}

wt_project="$root/wt-project"
wt_workspace="$root/wt-worktree"
wt_log="$root/wt-lifecycle.log"
make_fake_project "$wt_project"
make_fake_workspace "$wt_workspace"
WT_ROOT_PATH="$wt_project" \
  WT_WORKSPACE_PATH="$wt_workspace" \
  WT_WORKSPACE_NAME='wt-fixture' \
  WT_PORT_BASE=500 \
  LIFECYCLE_LOG="$wt_log" \
  bash "$DEV_WORKTREE" setup
assert_contains "$wt_log" "mise:where node@24|$wt_workspace"
assert_contains "$wt_log" "pnpm:install --frozen-lockfile|$wt_workspace"
assert_contains "$wt_log" "state:prod|$wt_project|$wt_workspace|500"
assert_contains "$wt_log" "pnpm:dev:start -d|$wt_workspace"
assert_symlink_target "$wt_workspace/apps/web/.env" "../../.env"
assert_symlink_target "$wt_workspace/apps/workers/.env" "../../.env"
assert_symlink_target "$wt_workspace/packages/db/.env" "../../.env"

t3_project="$root/t3-project"
t3_workspace="$root/t3-worktree"
t3_registry="$root/t3-ports.tsv"
t3_log="$root/t3-lifecycle.log"
make_fake_project "$t3_project"
make_fake_workspace "$t3_workspace"
T3CODE_PROJECT_ROOT="$t3_project" \
  T3CODE_WORKTREE_PATH="$t3_workspace" \
  T3_PORT_REGISTRY_FILE="$t3_registry" \
  LIFECYCLE_LOG="$t3_log" \
  bash "$SCRIPT_DIR/setup-t3-worktree.sh"
assert_contains "$t3_log" "mise:where node@24|$t3_workspace"
assert_contains "$t3_log" "pnpm:install --frozen-lockfile|$t3_workspace"
assert_contains "$t3_log" "state:prod|$t3_project|$t3_workspace|1000"
assert_contains "$t3_log" "pnpm:dev:start -d|$t3_workspace"
assert_contains "$t3_registry" "4000$(printf '\t')$t3_workspace"

# T3 actions select the thread worktree even when the action terminal starts
# at the project root.
action_log="$root/t3-actions.log"
T3CODE_WORKTREE_PATH="$t3_workspace" LIFECYCLE_LOG="$action_log" bash "$DEV_WORKTREE" start
T3CODE_WORKTREE_PATH="$t3_workspace" LIFECYCLE_LOG="$action_log" bash "$DEV_WORKTREE" stop
assert_contains "$action_log" "pnpm:dev:start -d|$t3_workspace"
assert_contains "$action_log" "pnpm:dev:stop|$t3_workspace"

# Explicit down owns only the shared infra containers.
: >"$FAKE_DOCKER_LOG"
printf 'true\n' >"$state_dir/marka-dev-meilisearch"
printf 'true\n' >"$state_dir/marka-dev-chrome"
bash "$INFRA" down >/dev/null
assert_contains "$FAKE_DOCKER_LOG" "rm -f marka-dev-meilisearch"
assert_contains "$FAKE_DOCKER_LOG" "rm -f marka-dev-chrome"

printf 'Shared dev infrastructure and worktree lifecycle tests passed.\n'
