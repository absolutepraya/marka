#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_VERSION="2"
DEFAULT_INSTALL_DIR="${HOME}/marka"
DEFAULT_PUBLIC_URL="http://localhost:3000"
DEFAULT_PORT="3000"
DEFAULT_BIND_ADDRESS="127.0.0.1"
DEFAULT_SEARCH_MODE="managed"
DEFAULT_RENDERER_MODE="managed"
DEFAULT_AI_MODE="deferred"
COMPOSE_PROJECT_NAME="karakeep"
WEB_IMAGE="ghcr.io/absolutepraya/marka:web-stable"
WORKERS_IMAGE="ghcr.io/absolutepraya/marka:workers-stable"
MEILI_IMAGE="getmeili/meilisearch:v1.41.0"
CHROME_IMAGE="ghcr.io/karakeep-app/karakeep-chrome:release"

COMMAND="install"
INSTALL_DIR=""
DATA_DIR=""
PUBLIC_URL=""
PORT=""
BIND_ADDRESS=""
DATA_MODE=""
SEARCH_MODE=""
MEILI_URL=""
RENDERER_MODE=""
RENDERER_URL=""
AI_MODE=""
DISABLE_SIGNUPS="false"
SIGNUPS_EXPLICIT=0
NON_INTERACTIVE=0
DRY_RUN=0
NO_START=0
RECONFIGURE=0
YES=0
BACKUP_DIR=""

PUBLIC_URL_SET=0
DATA_MODE_SET=0
SEARCH_MODE_SET=0
RENDERER_MODE_SET=0
AI_MODE_SET=0

say() { printf '%s\n' "$*"; }
info() { printf '==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF_USAGE'
Marka guided Docker Compose installer

Usage:
  bash install.sh [install] [options]
  bash install.sh update [--install-dir PATH]
  bash install.sh backup [--install-dir PATH] [--backup-dir PATH]
  bash install.sh start|stop|status [--install-dir PATH]
  bash install.sh uninstall [--install-dir PATH]

Install options:
  --install-dir PATH             Configuration directory (default: ~/marka)
  --data-dir PATH                Persistent Marka data directory (default: <install-dir>/data)
  --public-url URL               Public application URL, for example https://keep.example.com
  --port PORT                    Host port mapped to container port 3000 (default: 3000)
  --bind-address IP              Host bind address (default: 127.0.0.1)
  --data-mode fresh|existing     Create fresh data or use an existing compatible data directory
  --search managed|external|disabled
                                 Dedicated managed Meilisearch, external dedicated Meilisearch, or no full-text search
  --meili-url URL                Required when --search external
  --renderer managed|external|disabled
                                 Dedicated managed Chrome, external Browserless, or no browser rendering
  --renderer-url URL             Required when --renderer external
  --ai disabled|openai|deferred  Disable AI, configure OpenAI-compatible inference, or defer configuration
  --disable-signups              Set DISABLE_SIGNUPS=true (best for an existing installation)
  --allow-signups                Set DISABLE_SIGNUPS=false
  --non-interactive              Do not prompt. Explicit deployment choices are required.
  --dry-run                      Validate inputs and print the plan without writing files or starting containers
  --no-start                     Generate and validate configuration but do not pull/start containers
  --reconfigure                  Explicitly replace generated config after creating a timestamped backup
  --yes                          Skip the final interactive confirmation
  -h, --help                     Show this help

Secrets are intentionally not accepted as command-line flags. For non-interactive installs,
pass them through environment variables so they do not appear in process arguments:

  KARAKEEP_NEXTAUTH_SECRET        Optional; generated when omitted
  KARAKEEP_MEILI_MASTER_KEY      Required for external Meilisearch; generated for managed Meilisearch
  KARAKEEP_BROWSERLESS_TOKEN     Required for external Browserless
  KARAKEEP_OPENAI_API_KEY        Required when --ai openai
  KARAKEEP_OPENAI_BASE_URL       Optional OpenAI-compatible base URL
  KARAKEEP_INFERENCE_TEXT_MODEL  Optional text model override
  KARAKEEP_INFERENCE_IMAGE_MODEL Optional image model override

Examples:
  bash install.sh

  KARAKEEP_OPENAI_API_KEY='...' bash install.sh --non-interactive \
    --public-url https://keep.example.com \
    --data-mode fresh --search managed --renderer managed --ai openai

  bash install.sh update --install-dir /opt/marka
  bash install.sh backup --install-dir /opt/marka

The installer never installs Docker, edits firewall rules, configures DNS, or provisions TLS/reverse proxies.
EOF_USAGE
}

expand_path() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

validate_path() {
  local label="$1" value="$2"
  [[ -n "$value" ]] || die "$label cannot be empty"
  [[ "$value" == /* ]] || die "$label must be an absolute path: $value"
  [[ "$value" != "/" ]] || die "$label cannot be /"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$label cannot contain newlines"
}

validate_http_url() {
  local label="$1" value="$2"
  [[ "$value" =~ ^https?://[^[:space:]]+$ ]] || die "$label must start with http:// or https:// and contain no spaces"
}

validate_renderer_url() {
  local value="$1"
  [[ "$value" =~ ^(https?|wss?)://[^[:space:]]+$ ]] || die "Renderer URL must start with http://, https://, ws://, or wss://"
}

validate_port() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "Port must be a number"
  (( 1 <= 10#$1 && 10#$1 <= 65535 )) || die "Port must be between 1 and 65535"
}

validate_bind_address() {
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || die "Bind address must be an IPv4 address such as 127.0.0.1 or 0.0.0.0"
}

validate_choice() {
  local label="$1" value="$2" allowed="$3"
  case " $allowed " in
    *" $value "*) ;;
    *) die "$label must be one of: $allowed" ;;
  esac
}

secret_value_is_safe() {
  local label="$1" value="$2"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$label cannot contain newlines"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' was not found. Install it first and rerun this installer."
}

check_platform() {
  [[ "$(uname -s)" == "Linux" ]] || die "This guided installer currently supports Linux hosts only."
  case "$(uname -m)" in
    x86_64|amd64) ;;
    *) die "This repository currently publishes linux/amd64 images only; unsupported architecture: $(uname -m)" ;;
  esac
}

check_docker() {
  require_command docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required. Install the Docker Compose plugin and rerun."
  docker info >/dev/null 2>&1 || die "Docker is installed but the current user cannot reach the Docker daemon. Start Docker or grant this user access, then rerun."
}

preflight_install() {
  say "Marka Guided Setup"
  say ""
  say "Checking host prerequisites..."

  require_command docker
  say "  [ok] Docker CLI"

  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required. Install the Docker Compose plugin and rerun."
  say "  [ok] Docker Compose v2"

  docker info >/dev/null 2>&1 || die "Docker is installed but the current user cannot reach the Docker daemon. Start Docker or grant this user access, then rerun."
  say "  [ok] Docker daemon access"

  [[ "$(uname -s)" == "Linux" ]] || die "This guided installer currently supports Linux hosts only."
  say "  [ok] Linux"

  case "$(uname -m)" in
    x86_64|amd64) say "  [ok] amd64 architecture" ;;
    *) die "This repository currently publishes linux/amd64 images only; unsupported architecture: $(uname -m)" ;;
  esac

  require_command openssl
  say "  [ok] OpenSSL"

  say ""
  say "All required host prerequisites are available."
  say "Node.js is not required on the host; it runs inside the Marka containers."
  say ""
}

generate_secret() {
  require_command openssl
  openssl rand -hex 32
}

dotenv_line() {
  local key="$1" value="$2"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\$/\\\$}
  value=${value//\`/\\\`}
  printf '%s="%s"\n' "$key" "$value"
}

yaml_quote() {
  local value="$1"
  value=${value//\'/\'\'}
  printf "'%s'" "$value"
}

prompt_text() {
  local label="$1" default="$2" result
  if [[ -n "$default" ]]; then
    read -r -p "$label [$default]: " result
    printf '%s' "${result:-$default}"
  else
    read -r -p "$label: " result
    printf '%s' "$result"
  fi
}

prompt_choice() {
  local label="$1" allowed="$2" default="$3" result
  while true; do
    read -r -p "$label ($allowed) [$default]: " result
    result="${result:-$default}"
    case " $allowed " in
      *" $result "*) printf '%s' "$result"; return 0 ;;
    esac
    warn "Choose one of: $allowed"
  done
}

prompt_yes_no() {
  local label="$1" default="$2" result suffix
  if [[ "$default" == "yes" ]]; then suffix="Y/n"; else suffix="y/N"; fi
  while true; do
    read -r -p "$label [$suffix]: " result
    result="${result:-$default}"
    case "${result,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "Please answer yes or no" ;;
    esac
  done
}

prompt_secret() {
  local label="$1" result
  read -r -s -p "$label: " result
  printf '\n' >&2
  printf '%s' "$result"
}

parse_command() {
  if (($# > 0)); then
    case "$1" in
      install|update|backup|start|stop|status|uninstall)
        COMMAND="$1"
        shift
        ;;
    esac
  fi
  REMAINING_ARGS=("$@")
}

parse_args() {
  set -- "${REMAINING_ARGS[@]}"
  while (($#)); do
    case "$1" in
      --install-dir) [[ $# -ge 2 ]] || die "--install-dir requires a value"; INSTALL_DIR="$2"; shift 2 ;;
      --data-dir) [[ $# -ge 2 ]] || die "--data-dir requires a value"; DATA_DIR="$2"; shift 2 ;;
      --public-url) [[ $# -ge 2 ]] || die "--public-url requires a value"; PUBLIC_URL="$2"; PUBLIC_URL_SET=1; shift 2 ;;
      --port) [[ $# -ge 2 ]] || die "--port requires a value"; PORT="$2"; shift 2 ;;
      --bind-address) [[ $# -ge 2 ]] || die "--bind-address requires a value"; BIND_ADDRESS="$2"; shift 2 ;;
      --data-mode) [[ $# -ge 2 ]] || die "--data-mode requires a value"; DATA_MODE="$2"; DATA_MODE_SET=1; shift 2 ;;
      --search) [[ $# -ge 2 ]] || die "--search requires a value"; SEARCH_MODE="$2"; SEARCH_MODE_SET=1; shift 2 ;;
      --meili-url) [[ $# -ge 2 ]] || die "--meili-url requires a value"; MEILI_URL="$2"; shift 2 ;;
      --renderer) [[ $# -ge 2 ]] || die "--renderer requires a value"; RENDERER_MODE="$2"; RENDERER_MODE_SET=1; shift 2 ;;
      --renderer-url) [[ $# -ge 2 ]] || die "--renderer-url requires a value"; RENDERER_URL="$2"; shift 2 ;;
      --ai) [[ $# -ge 2 ]] || die "--ai requires a value"; AI_MODE="$2"; AI_MODE_SET=1; shift 2 ;;
      --disable-signups) DISABLE_SIGNUPS="true"; SIGNUPS_EXPLICIT=1; shift ;;
      --allow-signups) DISABLE_SIGNUPS="false"; SIGNUPS_EXPLICIT=1; shift ;;
      --non-interactive) NON_INTERACTIVE=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      --no-start) NO_START=1; shift ;;
      --reconfigure) RECONFIGURE=1; shift ;;
      --yes) YES=1; shift ;;
      --backup-dir) [[ $# -ge 2 ]] || die "--backup-dir requires a value"; BACKUP_DIR="$2"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1. Use --help for usage." ;;
    esac
  done
}

apply_defaults() {
  INSTALL_DIR="$(expand_path "${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")"
  DATA_DIR="$(expand_path "${DATA_DIR:-$INSTALL_DIR/data}")"
  PUBLIC_URL="${PUBLIC_URL:-$DEFAULT_PUBLIC_URL}"
  PUBLIC_URL="${PUBLIC_URL%/}"
  PORT="${PORT:-$DEFAULT_PORT}"
  BIND_ADDRESS="${BIND_ADDRESS:-$DEFAULT_BIND_ADDRESS}"
  DATA_MODE="${DATA_MODE:-fresh}"
  SEARCH_MODE="${SEARCH_MODE:-$DEFAULT_SEARCH_MODE}"
  RENDERER_MODE="${RENDERER_MODE:-$DEFAULT_RENDERER_MODE}"
  AI_MODE="${AI_MODE:-$DEFAULT_AI_MODE}"
}

interactive_configure() {
  local recommended=0

  say "Press Enter to accept the recommended value shown in [brackets]."
  say "Choose the recommended setup for a dedicated Marka deployment, or advanced setup for external/disabled services."
  say ""

  if prompt_yes_no "Use the recommended Marka setup?" "yes"; then
    recommended=1
  else
    say ""
    say "Advanced configuration selected."
    say "External Meilisearch should be dedicated to this Marka instance; sharing one Meilisearch index across multiple Marka deployments is not supported by this installer."
    say ""
  fi

  INSTALL_DIR="$(expand_path "$(prompt_text "Install directory" "${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")")"
  DATA_DIR="$(expand_path "$(prompt_text "Persistent data directory" "${DATA_DIR:-$INSTALL_DIR/data}")")"

  if [[ -d "$DATA_DIR" && -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
    DATA_MODE="$(prompt_choice "The data directory is not empty. Treat it as an existing compatible Marka data directory?" "existing fresh" "existing")"
  elif ((recommended)); then
    DATA_MODE="fresh"
  else
    DATA_MODE="$(prompt_choice "Data mode" "fresh existing" "fresh")"
  fi
  DATA_MODE_SET=1

  PUBLIC_URL="$(prompt_text "Public application URL" "${PUBLIC_URL:-$DEFAULT_PUBLIC_URL}")"
  PUBLIC_URL="${PUBLIC_URL%/}"
  PUBLIC_URL_SET=1

  if ((recommended)); then
    PORT="$DEFAULT_PORT"
    BIND_ADDRESS="$DEFAULT_BIND_ADDRESS"
    SEARCH_MODE="$DEFAULT_SEARCH_MODE"
    RENDERER_MODE="$DEFAULT_RENDERER_MODE"
    AI_MODE="$DEFAULT_AI_MODE"
    SEARCH_MODE_SET=1
    RENDERER_MODE_SET=1
    AI_MODE_SET=1

    say ""
    say "Using recommended service configuration:"
    say "  Host bind:  $BIND_ADDRESS:$PORT"
    say "  Search:     dedicated managed Meilisearch"
    say "  Renderer:   dedicated managed Chrome"
    say "  AI:         deferred"
  else
    PORT="$(prompt_text "Host port" "${PORT:-$DEFAULT_PORT}")"
    BIND_ADDRESS="$(prompt_text "Host bind address" "${BIND_ADDRESS:-$DEFAULT_BIND_ADDRESS}")"

    SEARCH_MODE="$(prompt_choice "Full-text search" "managed external disabled" "${SEARCH_MODE:-$DEFAULT_SEARCH_MODE}")"
    SEARCH_MODE_SET=1
    if [[ "$SEARCH_MODE" == "external" ]]; then
      warn "Use a Meilisearch service dedicated to this Marka deployment; sharing the fixed bookmarks index with another Marka deployment is unsupported."
      MEILI_URL="$(prompt_text "External dedicated Meilisearch URL" "$MEILI_URL")"
      if [[ -z "${KARAKEEP_MEILI_MASTER_KEY:-}" ]]; then
        KARAKEEP_MEILI_MASTER_KEY="$(prompt_secret "External Meilisearch master key")"
        export KARAKEEP_MEILI_MASTER_KEY
      fi
    fi

    RENDERER_MODE="$(prompt_choice "Browser rendering" "managed external disabled" "${RENDERER_MODE:-$DEFAULT_RENDERER_MODE}")"
    RENDERER_MODE_SET=1
    if [[ "$RENDERER_MODE" == "external" ]]; then
      RENDERER_URL="$(prompt_text "Private Browserless URL" "$RENDERER_URL")"
      if [[ -z "${KARAKEEP_BROWSERLESS_TOKEN:-}" ]]; then
        KARAKEEP_BROWSERLESS_TOKEN="$(prompt_secret "Browserless token")"
        export KARAKEEP_BROWSERLESS_TOKEN
      fi
    fi

    AI_MODE="$(prompt_choice "AI tagging/summarization" "disabled openai deferred" "${AI_MODE:-$DEFAULT_AI_MODE}")"
    AI_MODE_SET=1
    if [[ "$AI_MODE" == "openai" && -z "${KARAKEEP_OPENAI_API_KEY:-}" ]]; then
      KARAKEEP_OPENAI_API_KEY="$(prompt_secret "OpenAI-compatible API key")"
      export KARAKEEP_OPENAI_API_KEY
    fi
  fi

  if [[ "$DATA_MODE" == "existing" ]]; then
    if prompt_yes_no "Disable new signups now?" "yes"; then
      DISABLE_SIGNUPS="true"
    else
      DISABLE_SIGNUPS="false"
    fi
    SIGNUPS_EXPLICIT=1
  else
    DISABLE_SIGNUPS="false"
    SIGNUPS_EXPLICIT=1
  fi
}

validate_install_config() {
  validate_path "Install directory" "$INSTALL_DIR"
  validate_path "Data directory" "$DATA_DIR"
  validate_http_url "Public URL" "$PUBLIC_URL"
  validate_port "$PORT"
  validate_bind_address "$BIND_ADDRESS"
  validate_choice "Data mode" "$DATA_MODE" "fresh existing"
  validate_choice "Search mode" "$SEARCH_MODE" "managed external disabled"
  validate_choice "Renderer mode" "$RENDERER_MODE" "managed external disabled"
  validate_choice "AI mode" "$AI_MODE" "disabled openai deferred"

  if ((NON_INTERACTIVE)); then
    ((PUBLIC_URL_SET && DATA_MODE_SET && SEARCH_MODE_SET && RENDERER_MODE_SET && AI_MODE_SET)) || \
      die "--non-interactive requires explicit --public-url, --data-mode, --search, --renderer, and --ai choices"
  fi

  if [[ "$SEARCH_MODE" == "external" ]]; then
    [[ -n "$MEILI_URL" ]] || die "--meili-url is required when --search external"
    validate_http_url "External Meilisearch URL" "$MEILI_URL"
    [[ -n "${KARAKEEP_MEILI_MASTER_KEY:-}" ]] || die "KARAKEEP_MEILI_MASTER_KEY is required for external Meilisearch"
    secret_value_is_safe "KARAKEEP_MEILI_MASTER_KEY" "$KARAKEEP_MEILI_MASTER_KEY"
  fi

  if [[ "$RENDERER_MODE" == "external" ]]; then
    [[ -n "$RENDERER_URL" ]] || die "--renderer-url is required when --renderer external"
    validate_renderer_url "$RENDERER_URL"
    [[ -n "${KARAKEEP_BROWSERLESS_TOKEN:-}" ]] || die "KARAKEEP_BROWSERLESS_TOKEN is required for external Browserless"
    secret_value_is_safe "KARAKEEP_BROWSERLESS_TOKEN" "$KARAKEEP_BROWSERLESS_TOKEN"
  fi

  if [[ "$AI_MODE" == "openai" ]]; then
    [[ -n "${KARAKEEP_OPENAI_API_KEY:-}" ]] || die "KARAKEEP_OPENAI_API_KEY is required when --ai openai"
    secret_value_is_safe "KARAKEEP_OPENAI_API_KEY" "$KARAKEEP_OPENAI_API_KEY"
    if [[ -n "${KARAKEEP_OPENAI_BASE_URL:-}" ]]; then
      validate_http_url "KARAKEEP_OPENAI_BASE_URL" "$KARAKEEP_OPENAI_BASE_URL"
    fi
  fi

  if [[ -n "${KARAKEEP_NEXTAUTH_SECRET:-}" ]]; then
    secret_value_is_safe "KARAKEEP_NEXTAUTH_SECRET" "$KARAKEEP_NEXTAUTH_SECRET"
  fi

  if [[ "$DATA_MODE" == "fresh" && "$DISABLE_SIGNUPS" == "true" ]]; then
    die "A fresh install cannot start with signups disabled because no administrator account exists yet. Use --allow-signups, then disable signups after creating the first account."
  fi
}

print_plan() {
  cat <<EOF_PLAN
Marka installation plan
  Install directory: $INSTALL_DIR
  Data directory:    $DATA_DIR ($DATA_MODE)
  Public URL:        $PUBLIC_URL
  Bind:              $BIND_ADDRESS:$PORT -> container :3000
  Search:            $SEARCH_MODE
  Renderer:          $RENDERER_MODE
  AI:                $AI_MODE
  Signups disabled:  $DISABLE_SIGNUPS
  Compose project:   $COMPOSE_PROJECT_NAME
  Web image:         $WEB_IMAGE
  Workers image:     $WORKERS_IMAGE
EOF_PLAN

  if [[ "$BIND_ADDRESS" == "127.0.0.1" && "$PUBLIC_URL" != http://localhost* && "$PUBLIC_URL" != http://127.0.0.1* ]]; then
    say ""
    say "The app will only listen on localhost. Configure your reverse proxy/TLS to forward $PUBLIC_URL to 127.0.0.1:$PORT."
  elif [[ "$BIND_ADDRESS" == "0.0.0.0" ]]; then
    say ""
    warn "The application port will be exposed on all host interfaces. Use a firewall and TLS/reverse proxy for Internet-facing deployments."
  fi

  case "$SEARCH_MODE" in
    managed) say "Managed Meilisearch will run privately in the same Compose project." ;;
    external) say "The installer will connect Marka to the supplied external dedicated Meilisearch URL." ;;
    disabled) say "Full-text search will be disabled." ;;
  esac

  case "$RENDERER_MODE" in
    managed) say "A private Chrome container will be started without publishing its debugging port." ;;
    external) say "Workers will connect on demand to the supplied token-protected Browserless endpoint." ;;
    disabled) say "Rendered screenshots and JavaScript browser crawling will be disabled; basic crawling can still work." ;;
  esac

  case "$AI_MODE" in
    openai) say "AI tagging and summarization will use the configured OpenAI-compatible provider." ;;
    disabled) say "AI tagging and summarization will be explicitly disabled." ;;
    deferred) say "AI configuration will be left disabled for now and can be added later in workers.env." ;;
  esac

  say ""
  say "The installer will not configure DNS, TLS certificates, a reverse proxy, firewall rules, or Docker itself."
}

backup_existing_config() {
  local stamp backup_root
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_root="$INSTALL_DIR/config-backups/$stamp"
  mkdir -p "$backup_root"
  chmod 700 "$INSTALL_DIR/config-backups" "$backup_root"
  local file
  for file in docker-compose.yml app.env workers.env .data-dir install.sh; do
    if [[ -e "$INSTALL_DIR/$file" ]]; then
      cp -a "$INSTALL_DIR/$file" "$backup_root/$file"
    fi
  done
  info "Existing generated configuration backed up to $backup_root"
}

write_generated_files() {
  local tmp_dir="$1"
  local nextauth_secret meili_key screenshot_enabled auto_tag auto_summary

  nextauth_secret="${KARAKEEP_NEXTAUTH_SECRET:-$(generate_secret)}"
  if [[ "$SEARCH_MODE" == "managed" ]]; then
    meili_key="${KARAKEEP_MEILI_MASTER_KEY:-$(generate_secret)}"
  elif [[ "$SEARCH_MODE" == "external" ]]; then
    meili_key="$KARAKEEP_MEILI_MASTER_KEY"
  else
    meili_key=""
  fi

  if [[ "$RENDERER_MODE" == "disabled" ]]; then screenshot_enabled="false"; else screenshot_enabled="true"; fi
  if [[ "$AI_MODE" == "openai" ]]; then auto_tag="true"; auto_summary="true"; else auto_tag="false"; auto_summary="false"; fi

  {
    dotenv_line NEXTAUTH_URL "$PUBLIC_URL"
    dotenv_line NEXTAUTH_SECRET "$nextauth_secret"
    dotenv_line DISABLE_SIGNUPS "$DISABLE_SIGNUPS"
    dotenv_line EMBEDDING_ENABLE_AUTO_INDEXING "false"
    dotenv_line INFERENCE_ENABLE_AUTO_TAGGING "$auto_tag"
    dotenv_line INFERENCE_ENABLE_AUTO_SUMMARIZATION "$auto_summary"
    dotenv_line CRAWLER_STORE_SCREENSHOT "$screenshot_enabled"
    dotenv_line CRAWLER_FULL_PAGE_SCREENSHOT "false"
    dotenv_line CRAWLER_STORE_PDF "false"
    dotenv_line CRAWLER_FULL_PAGE_ARCHIVE "false"
    dotenv_line CRAWLER_VIDEO_DOWNLOAD "false"
    dotenv_line ASSET_PREPROCESSING_NUM_WORKERS "1"
    if [[ "$SEARCH_MODE" == "managed" ]]; then
      dotenv_line MEILI_ADDR "http://meilisearch:7700"
      dotenv_line MEILI_MASTER_KEY "$meili_key"
    elif [[ "$SEARCH_MODE" == "external" ]]; then
      dotenv_line MEILI_ADDR "$MEILI_URL"
      dotenv_line MEILI_MASTER_KEY "$meili_key"
    fi
  } >"$tmp_dir/app.env"

  {
    dotenv_line WORKER_PROFILE "screenshot-first"
    case "$RENDERER_MODE" in
      managed)
        dotenv_line BROWSER_WEB_URL "http://chrome:9222"
        dotenv_line BROWSER_CONNECT_ONDEMAND "false"
        dotenv_line CRAWLER_HEADLESS_BROWSER "true"
        ;;
      external)
        dotenv_line BROWSERLESS_URL "$RENDERER_URL"
        dotenv_line BROWSERLESS_TOKEN "$KARAKEEP_BROWSERLESS_TOKEN"
        dotenv_line BROWSER_CONNECT_ONDEMAND "true"
        dotenv_line CRAWLER_HEADLESS_BROWSER "true"
        ;;
      disabled)
        dotenv_line BROWSER_CONNECT_ONDEMAND "false"
        dotenv_line CRAWLER_HEADLESS_BROWSER "false"
        ;;
    esac

    if [[ "$AI_MODE" == "openai" ]]; then
      dotenv_line OPENAI_API_KEY "$KARAKEEP_OPENAI_API_KEY"
      if [[ -n "${KARAKEEP_OPENAI_BASE_URL:-}" ]]; then dotenv_line OPENAI_BASE_URL "$KARAKEEP_OPENAI_BASE_URL"; fi
      if [[ -n "${KARAKEEP_INFERENCE_TEXT_MODEL:-}" ]]; then dotenv_line INFERENCE_TEXT_MODEL "$KARAKEEP_INFERENCE_TEXT_MODEL"; fi
      if [[ -n "${KARAKEEP_INFERENCE_IMAGE_MODEL:-}" ]]; then dotenv_line INFERENCE_IMAGE_MODEL "$KARAKEEP_INFERENCE_IMAGE_MODEL"; fi
    fi
  } >"$tmp_dir/workers.env"

  {
    say "# Generated by scripts/install.sh v$SCRIPT_VERSION"
    say "# Stable project name: $COMPOSE_PROJECT_NAME"
    say "# Update with: ./install.sh update"
    say "# Back up first with: ./install.sh backup"
    say "# For rollback, pin web/workers to matching immutable web-v<version> and workers-v<version> tags, or matching web-sha-<sha> and workers-sha-<sha> tags, from one known-good commit."
    say "name: $COMPOSE_PROJECT_NAME"
    say ""
    say "services:"
    say "  web:"
    say "    image: $WEB_IMAGE"
    say "    restart: unless-stopped"
    say "    volumes:"
    printf '      - %s\n' "$(yaml_quote "$DATA_DIR:/data")"
    say "    ports:"
    printf '      - %s\n' "$(yaml_quote "$BIND_ADDRESS:$PORT:3000")"
    say "    env_file:"
    say "      - ./app.env"
    say "    environment:"
    say "      DATA_DIR: /data"
    if [[ "$SEARCH_MODE" == "managed" ]]; then
      say "    depends_on:"
      say "      meilisearch:"
      say "        condition: service_started"
    fi
    say ""
    say "  workers:"
    say "    image: $WORKERS_IMAGE"
    say "    restart: unless-stopped"
    say "    volumes:"
    printf '      - %s\n' "$(yaml_quote "$DATA_DIR:/data")"
    say "    env_file:"
    say "      - ./app.env"
    say "      - ./workers.env"
    say "    environment:"
    say "      DATA_DIR: /data"
    say "      WORKER_PROFILE: screenshot-first"
    say "    depends_on:"
    say "      web:"
    say "        condition: service_healthy"
    if [[ "$SEARCH_MODE" == "managed" ]]; then
      say "      meilisearch:"
      say "        condition: service_started"
    fi
    if [[ "$RENDERER_MODE" == "managed" ]]; then
      say "      chrome:"
      say "        condition: service_started"
    fi

    if [[ "$SEARCH_MODE" == "managed" ]]; then
      say ""
      say "  meilisearch:"
      say "    image: $MEILI_IMAGE"
      say "    restart: unless-stopped"
      say "    env_file:"
      say "      - ./app.env"
      say "    environment:"
      say "      MEILI_NO_ANALYTICS: \"true\""
      say "    volumes:"
      say "      - meilisearch:/meili_data"
    fi

    if [[ "$RENDERER_MODE" == "managed" ]]; then
      say ""
      say "  chrome:"
      say "    image: $CHROME_IMAGE"
      say "    restart: unless-stopped"
      say "    init: true"
      say "    command:"
      say "      - --disable-gpu"
      say "      - --disable-dev-shm-usage"
      say "      - --hide-scrollbars"
      say "      - --disable-blink-features=AutomationControlled"
      say "      - --window-size=1440,900"
    fi

    if [[ "$SEARCH_MODE" == "managed" ]]; then
      say ""
      say "volumes:"
      say "  meilisearch:"
    fi
  } >"$tmp_dir/docker-compose.yml"

  printf '%s\n' "$DATA_DIR" >"$tmp_dir/.data-dir"
  chmod 600 "$tmp_dir/app.env" "$tmp_dir/workers.env" "$tmp_dir/.data-dir"
  chmod 644 "$tmp_dir/docker-compose.yml"
}

copy_self() {
  local tmp_dir="$1"
  if [[ -f "${BASH_SOURCE[0]}" ]]; then
    cp "${BASH_SOURCE[0]}" "$tmp_dir/install.sh"
    chmod 700 "$tmp_dir/install.sh"
  else
    warn "Could not copy installer into the install directory; keep your downloaded installer for update/backup commands."
  fi
}

install_command() {
  preflight_install

  if ((NON_INTERACTIVE == 0)); then
    interactive_configure
  fi

  apply_defaults
  validate_install_config
  print_plan

  if ((DRY_RUN)); then
    say ""
    info "Dry run complete. No files were written and no containers were changed."
    return 0
  fi

  if [[ -e "$INSTALL_DIR/docker-compose.yml" || -e "$INSTALL_DIR/app.env" || -e "$INSTALL_DIR/workers.env" ]]; then
    if ((RECONFIGURE == 0 && NON_INTERACTIVE == 0)); then
      if prompt_yes_no "Generated configuration already exists. Back it up and reconfigure it?" "no"; then
        RECONFIGURE=1
      fi
    fi
    ((RECONFIGURE)) || die "Generated configuration already exists in $INSTALL_DIR. Rerun with --reconfigure to back it up and replace it explicitly."
  fi

  if [[ "$DATA_MODE" == "fresh" ]]; then
    if [[ -d "$DATA_DIR" && -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
      die "Fresh data mode refuses to use non-empty directory $DATA_DIR. Use --data-mode existing only for a compatible Marka data directory."
    fi
  else
    [[ -d "$DATA_DIR" ]] || die "Existing data mode requires the data directory to already exist: $DATA_DIR"
  fi

  if ((YES == 0 && NON_INTERACTIVE == 0)); then
    say ""
    prompt_yes_no "Write this configuration and continue?" "yes" || die "Installation cancelled"
  fi

  mkdir -p "$INSTALL_DIR" "$DATA_DIR"
  chmod 700 "$INSTALL_DIR"
  if [[ "$DATA_MODE" == "fresh" ]]; then chmod 700 "$DATA_DIR"; fi

  if ((RECONFIGURE)); then
    backup_existing_config
  fi

  local tmp_dir
  tmp_dir="$(mktemp -d "$INSTALL_DIR/.guided-install.XXXXXX")"
  trap 'rm -rf "${tmp_dir:-}"' RETURN

  write_generated_files "$tmp_dir"
  copy_self "$tmp_dir"

  docker compose -f "$tmp_dir/docker-compose.yml" config --quiet >/dev/null

  mv "$tmp_dir/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  mv "$tmp_dir/app.env" "$INSTALL_DIR/app.env"
  mv "$tmp_dir/workers.env" "$INSTALL_DIR/workers.env"
  mv "$tmp_dir/.data-dir" "$INSTALL_DIR/.data-dir"
  if [[ -f "$tmp_dir/install.sh" ]]; then mv "$tmp_dir/install.sh" "$INSTALL_DIR/install.sh"; fi
  rmdir "$tmp_dir"
  trap - RETURN

  info "Configuration written to $INSTALL_DIR"

  if ((NO_START)); then
    info "Configuration validated. Containers were not started because --no-start was supplied."
  else
    (
      cd "$INSTALL_DIR"
      docker compose pull
      docker compose up -d --remove-orphans
    )
    info "Marka is starting. Check status with: $INSTALL_DIR/install.sh status"
  fi

  say ""
  say "Next steps:"
  say "  1. If $PUBLIC_URL is not localhost, configure DNS plus a reverse proxy/TLS endpoint to $BIND_ADDRESS:$PORT."
  say "  2. Open $PUBLIC_URL and create the first administrator account."
  if [[ "$DATA_MODE" == "fresh" && "$DISABLE_SIGNUPS" == "false" ]]; then
    say "  3. After the first account exists, set DISABLE_SIGNUPS=\"true\" in $INSTALL_DIR/app.env and run $INSTALL_DIR/install.sh start."
  else
    say "  3. Confirm the configured signup policy matches your instance."
  fi
  say "  4. Create a backup with: $INSTALL_DIR/install.sh backup"
  say "  5. Update later with:    $INSTALL_DIR/install.sh update"
  say ""
  say "Persistent application data lives at $DATA_DIR and is never removed by the uninstall command."
}

management_install_dir() {
  if [[ -z "$INSTALL_DIR" && -f "$HOME/marka/docker-compose.yml" ]]; then
    INSTALL_DIR="$HOME/marka"
  elif [[ -z "$INSTALL_DIR" && -f "$HOME/karakeep/docker-compose.yml" ]]; then
    # Keep existing guided installations manageable after the default moves to Marka.
    INSTALL_DIR="$HOME/karakeep"
  else
    INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  fi
  INSTALL_DIR="$(expand_path "$INSTALL_DIR")"
  validate_path "Install directory" "$INSTALL_DIR"
  [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || die "No guided Marka installation found at $INSTALL_DIR"
}

compose_in_install_dir() {
  (
    cd "$INSTALL_DIR"
    docker compose "$@"
  )
}

update_command() {
  check_platform
  management_install_dir
  check_docker
  info "Pulling the current paired web-stable/workers-stable images and recreating changed services..."
  compose_in_install_dir config --quiet >/dev/null
  compose_in_install_dir pull
  compose_in_install_dir up -d --remove-orphans
  info "Update complete. For a rollback, pin both web and workers to immutable tags from the same known-good commit."
}

backup_command() {
  check_platform
  management_install_dir
  check_docker
  require_command tar
  [[ -f "$INSTALL_DIR/.data-dir" ]] || die "Missing $INSTALL_DIR/.data-dir; cannot determine the persistent data directory safely."
  DATA_DIR="$(head -n 1 "$INSTALL_DIR/.data-dir")"
  validate_path "Data directory" "$DATA_DIR"
  [[ -d "$DATA_DIR" ]] || die "Data directory does not exist: $DATA_DIR"

  BACKUP_DIR="$(expand_path "${BACKUP_DIR:-$INSTALL_DIR/backups}")"
  validate_path "Backup directory" "$BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  local stamp archive web_was_running workers_was_running
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  archive="$BACKUP_DIR/marka-data-$stamp.tar.gz"
  web_was_running="$(compose_in_install_dir ps --status running -q web || true)"
  workers_was_running="$(compose_in_install_dir ps --status running -q workers || true)"

  info "Stopping web/workers briefly for a consistent SQLite/assets backup..."
  compose_in_install_dir stop workers web >/dev/null
  tar -C "$(dirname "$DATA_DIR")" -czf "$archive" "$(basename "$DATA_DIR")"
  chmod 600 "$archive"

  if [[ -n "$web_was_running" || -n "$workers_was_running" ]]; then
    compose_in_install_dir up -d web workers >/dev/null
  fi

  info "Backup written to $archive"
  say "Meilisearch data is not included because it is a derived search index; the authoritative SQLite/assets state is in this archive."
}

start_command() {
  check_platform
  management_install_dir
  check_docker
  compose_in_install_dir config --quiet >/dev/null
  compose_in_install_dir up -d --remove-orphans
}

stop_command() {
  check_platform
  management_install_dir
  check_docker
  compose_in_install_dir stop
}

status_command() {
  check_platform
  management_install_dir
  check_docker
  compose_in_install_dir ps
}

uninstall_command() {
  check_platform
  management_install_dir
  check_docker
  local data_dir="unknown"
  if [[ -f "$INSTALL_DIR/.data-dir" ]]; then data_dir="$(head -n 1 "$INSTALL_DIR/.data-dir")"; fi
  compose_in_install_dir down --remove-orphans
  info "Containers and the Compose network were removed."
  say "Configuration remains at: $INSTALL_DIR"
  say "Persistent data remains at: $data_dir"
  say "This command deliberately does not delete either directory. Remove them manually only after verifying your backups."
}

main() {
  parse_command "$@"
  parse_args
  case "$COMMAND" in
    install) install_command ;;
    update) update_command ;;
    backup) backup_command ;;
    start) start_command ;;
    stop) stop_command ;;
    status) status_command ;;
    uninstall) uninstall_command ;;
    *) die "Unsupported command: $COMMAND" ;;
  esac
}

main "$@"
