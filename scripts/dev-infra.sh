#!/usr/bin/env bash
set -Eeuo pipefail

MEILI_CONTAINER="marka-dev-meilisearch"
CHROME_CONTAINER="marka-dev-chrome"
BROWSERLESS_CONTAINER="marka-dev-browserless"
LEGACY_MEILI_CONTAINER="karakeep-dev-meilisearch"
LEGACY_CHROME_CONTAINER="karakeep-dev-chrome"
MEILI_VOLUME="marka-dev-meilisearch-v155-data"
MEILI_PORT="7700"
CHROME_PORT="${MARKA_DEV_CHROME_PORT:-9250}"
BROWSERLESS_PORT="${MARKA_DEV_BROWSERLESS_PORT:-9251}"
RENDERER="${MARKA_DEV_RENDERER:-browserless}"
MEILI_IMAGE="getmeili/meilisearch:v1.55.0@sha256:ff546679970126f8822e15d1b6a06bfbff1f2ce2e43f810cfb5258012f92de5c"
CHROME_IMAGE="ghcr.io/karakeep-app/karakeep-chrome:release"
# Same multi-architecture Browserless v2 build as the personal VPS renderer.
# Docker selects the native architecture, including arm64 on Apple Silicon.
BROWSERLESS_IMAGE="ghcr.io/browserless/chromium:v2.57.3@sha256:40dff7c23e0e378ba451c23ef66394ffb81bd11e6b9fe8ef3066d59eb402cc5d"
CHROME_CONTAINER_WAS_ADOPTED=false

info() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if ! [[ "$CHROME_PORT" =~ ^[0-9]+$ ]]; then
  die "MARKA_DEV_CHROME_PORT must be between 1 and 65535."
fi
if ((10#$CHROME_PORT < 1 || 10#$CHROME_PORT > 65535)); then
  die "MARKA_DEV_CHROME_PORT must be between 1 and 65535."
fi
if ! [[ "$BROWSERLESS_PORT" =~ ^[0-9]+$ ]] || ((10#$BROWSERLESS_PORT < 1 || 10#$BROWSERLESS_PORT > 65535)); then
  die "MARKA_DEV_BROWSERLESS_PORT must be between 1 and 65535."
fi
case "$RENDERER" in
  browserless|chrome) ;;
  *) die "MARKA_DEV_RENDERER must be browserless or chrome." ;;
esac

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker first."
  docker info >/dev/null 2>&1 || die "Docker is installed but the current user cannot reach the Docker daemon. Start Docker and retry."
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" == "true" ]]
}

adopt_legacy_container() {
  local legacy="$1" current="$2"
  if container_exists "$legacy" && ! container_exists "$current"; then
    docker rename "$legacy" "$current" >/dev/null || die "Failed to rename legacy $legacy container to $current."
    if [[ "$legacy" == "$LEGACY_CHROME_CONTAINER" ]]; then
      CHROME_CONTAINER_WAS_ADOPTED=true
    fi
    info "Renamed legacy $legacy container to $current"
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return
  fi
  return 1
}

ensure_available_port() {
  local port="$1" owner="$2"
  if port_in_use "$port"; then
    die "Port $port is already in use by something other than $owner. Stop the conflicting service before starting shared Marka dev infrastructure."
  fi
}

chrome_host_port() {
  docker inspect -f '{{range $p, $bindings := .HostConfig.PortBindings}}{{if eq $p "9222/tcp"}}{{(index $bindings 0).HostPort}}{{end}}{{end}}' "$CHROME_CONTAINER" 2>/dev/null || true
}

ensure_meilisearch() {
  adopt_legacy_container "$LEGACY_MEILI_CONTAINER" "$MEILI_CONTAINER"
  if container_exists "$MEILI_CONTAINER"; then
    local existing_image
    existing_image="$(docker inspect -f '{{.Config.Image}}' "$MEILI_CONTAINER")"
    [[ "$existing_image" == "$MEILI_IMAGE" ]] || die "Existing $MEILI_CONTAINER uses a different image. Back up and migrate shared search before changing its image; never open an older database with a newer engine."
    if container_running "$MEILI_CONTAINER"; then
      info "Reusing shared Meilisearch on http://127.0.0.1:$MEILI_PORT"
      return
    fi
    ensure_available_port "$MEILI_PORT" "$MEILI_CONTAINER"
    docker start "$MEILI_CONTAINER" >/dev/null || die "Failed to start existing $MEILI_CONTAINER container."
    info "Started existing shared Meilisearch on http://127.0.0.1:$MEILI_PORT"
    return
  fi

  ensure_available_port "$MEILI_PORT" "$MEILI_CONTAINER"
  docker run -d \
    --name "$MEILI_CONTAINER" \
    --restart unless-stopped \
    -p "127.0.0.1:$MEILI_PORT:7700" \
    -e MEILI_NO_ANALYTICS=true \
    -v "$MEILI_VOLUME:/meili_data" \
    "$MEILI_IMAGE" >/dev/null || die "Failed to start shared Meilisearch. Check whether port $MEILI_PORT became occupied and retry."
  info "Started shared Meilisearch on http://127.0.0.1:$MEILI_PORT"
}

ensure_chrome() {
  adopt_legacy_container "$LEGACY_CHROME_CONTAINER" "$CHROME_CONTAINER"
  if container_exists "$CHROME_CONTAINER"; then
    local existing_port
    existing_port="$(chrome_host_port)"
    if [[ "$existing_port" != "$CHROME_PORT" ]]; then
      if [[ "$CHROME_CONTAINER_WAS_ADOPTED" != true ]]; then
        die "Existing $CHROME_CONTAINER is mapped to host port ${existing_port:-unknown}, but port $CHROME_PORT is configured. Run pnpm dev:infra:down before changing MARKA_DEV_CHROME_PORT."
      fi
      info "Migrating legacy $CHROME_CONTAINER from host port ${existing_port:-unknown} to $CHROME_PORT"
      docker rm -f "$CHROME_CONTAINER" >/dev/null || die "Failed to remove legacy $CHROME_CONTAINER container."
    fi

    if ! container_exists "$CHROME_CONTAINER"; then
      :
    elif container_running "$CHROME_CONTAINER"; then
      info "Reusing shared Chrome on http://127.0.0.1:$CHROME_PORT"
      return
    else
      ensure_available_port "$CHROME_PORT" "$CHROME_CONTAINER"
      docker start "$CHROME_CONTAINER" >/dev/null || die "Failed to start existing $CHROME_CONTAINER container."
      info "Started existing shared Chrome on http://127.0.0.1:$CHROME_PORT"
      return
    fi
  fi

  ensure_available_port "$CHROME_PORT" "$CHROME_CONTAINER"
  docker run -d \
    --name "$CHROME_CONTAINER" \
    --restart unless-stopped \
    --init \
    -p "127.0.0.1:$CHROME_PORT:9222" \
    "$CHROME_IMAGE" \
    --disable-gpu \
    --disable-dev-shm-usage \
    --hide-scrollbars \
    --disable-blink-features=AutomationControlled \
    --window-size=1440,900 >/dev/null || die "Failed to start shared Chrome. Check whether port $CHROME_PORT became occupied and retry."
  info "Started shared Chrome on http://127.0.0.1:$CHROME_PORT"
}

ensure_browserless() {
  if container_exists "$BROWSERLESS_CONTAINER"; then
    local existing_port existing_image
    existing_port="$(docker inspect -f '{{(index (index .HostConfig.PortBindings "3000/tcp") 0).HostPort}}' "$BROWSERLESS_CONTAINER")"
    existing_image="$(docker inspect -f '{{.Config.Image}}' "$BROWSERLESS_CONTAINER")"
    [[ "$existing_port" == "$BROWSERLESS_PORT" ]] || die "Existing $BROWSERLESS_CONTAINER is mapped to host port $existing_port, but port $BROWSERLESS_PORT is configured. Stop shared infrastructure explicitly before changing its port."
    [[ "$existing_image" == "$BROWSERLESS_IMAGE" ]] || die "Existing $BROWSERLESS_CONTAINER uses a different image. Stop shared infrastructure explicitly before changing its image."
    if ! container_running "$BROWSERLESS_CONTAINER"; then
      ensure_available_port "$BROWSERLESS_PORT" "$BROWSERLESS_CONTAINER"
      docker start "$BROWSERLESS_CONTAINER" >/dev/null
    fi
  else
    ensure_available_port "$BROWSERLESS_PORT" "$BROWSERLESS_CONTAINER"
    local generated_token
    generated_token="$(openssl rand -hex 24)"
    # Pass the token by environment name, never as a command argument or log.
    TOKEN="$generated_token" docker run -d \
      --name "$BROWSERLESS_CONTAINER" \
      --restart unless-stopped \
      --memory 1536m \
      --shm-size 256m \
      --cpus 1 \
      -p "127.0.0.1:$BROWSERLESS_PORT:3000" \
      --env TOKEN \
      -e CONCURRENT=2 \
      -e QUEUED=4 \
      -e TIMEOUT=60000 \
      --health-cmd 'node -e "fetch(\"http://127.0.0.1:3000/pressure?token=\"+encodeURIComponent(process.env.TOKEN)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
      --health-interval 10s --health-timeout 3s --health-start-period 20s \
      "$BROWSERLESS_IMAGE" >/dev/null || die "Failed to start local Browserless."
  fi
  local attempt health
  for ((attempt=0; attempt<90; attempt++)); do
    container_running "$BROWSERLESS_CONTAINER" || die "Local Browserless stopped during startup. Inspect its container logs."
    health="$(docker inspect -f '{{.State.Health.Status}}' "$BROWSERLESS_CONTAINER")"
    if [[ "$health" == healthy ]]; then
      info "Local Browserless is ready on http://127.0.0.1:$BROWSERLESS_PORT"
      return
    fi
    sleep 1
  done
  die "Local Browserless did not become healthy within 90 seconds."
}

up() {
  require_docker
  ensure_meilisearch
  case "$RENDERER" in
    browserless) ensure_browserless ;;
    chrome) ensure_chrome ;;
  esac
}

status_one() {
  local name="$1" endpoint="$2"
  if ! container_exists "$name"; then
    printf '%-28s %s\n' "$name" "not created"
  elif container_running "$name"; then
    printf '%-28s running  %s\n' "$name" "$endpoint"
  else
    printf '%-28s %s\n' "$name" "stopped"
  fi
}

status() {
  require_docker
  status_one "$MEILI_CONTAINER" "http://127.0.0.1:$MEILI_PORT"
  status_one "$CHROME_CONTAINER" "http://127.0.0.1:$CHROME_PORT"
  status_one "$BROWSERLESS_CONTAINER" "http://127.0.0.1:$BROWSERLESS_PORT"
}

down() {
  require_docker
  local removed=0
  if container_exists "$MEILI_CONTAINER"; then
    docker rm -f "$MEILI_CONTAINER" >/dev/null
    removed=1
  fi
  if container_exists "$CHROME_CONTAINER"; then
    docker rm -f "$CHROME_CONTAINER" >/dev/null
    removed=1
  fi
  if container_exists "$BROWSERLESS_CONTAINER"; then
    docker rm -f "$BROWSERLESS_CONTAINER" >/dev/null
    removed=1
  fi
  if ((removed)); then
    info "Stopped shared Marka dev infrastructure. Meilisearch data volume $MEILI_VOLUME was preserved."
  else
    info "Shared Marka dev infrastructure is not running."
  fi
}

usage() {
  cat <<'EOF'
Usage: scripts/dev-infra.sh up|status|down

  up      Start or reuse shared Meilisearch and production-compatible Browserless.
  status  Show whether the shared containers are running.
  down    Remove the shared containers while preserving the Meilisearch volume.

MARKA_DEV_BROWSERLESS_PORT defaults to 9251. The renderer is token-protected
and bound to loopback. MARKA_DEV_RENDERER=chrome selects the legacy CDP service.
EOF
}

case "${1:-}" in
  up) up ;;
  status) status ;;
  down) down ;;
  -h|--help) usage ;;
  *) usage >&2; exit 1 ;;
esac
