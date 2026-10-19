#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_VERSION="3"
DEFAULT_INSTALL_DIR="${HOME}/marka"
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
ACCESS_MODE=""
WAIT_TIMEOUT="180"
EXISTING_INSTALL=0
PREVIOUS_AI_MODE=""
PREVIOUS_RENDERER_MODE=""

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
  bash install.sh start|stop|status|doctor [--install-dir PATH]
  bash install.sh uninstall [--install-dir PATH]

Install options:
  --install-dir PATH             Configuration directory (default: ~/marka)
  --data-dir PATH                Persistent Marka data directory (default: <install-dir>/data)
  --public-url URL               Public application URL, for example https://keep.example.com
  --port PORT                    Host port mapped to container port 3000 (default: 3000)
  --bind-address IP              Host bind address (default: 127.0.0.1)
  --access local|lan|domain       Access intent (local/domain bind privately; LAN binds all interfaces)
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
  --wait-timeout SECONDS         Readiness timeout for install/start/update (default: 180)
  --backup-dir PATH              Backup/update archive destination (default: <install-dir>/backups)
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
  # shellcheck disable=SC2088 # Match a literal tilde entered at a prompt.
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    '~/'*) printf '%s/%s' "$HOME" "${1:2}" ;;
    *) printf '%s' "$1" ;;
  esac
}

validate_path() {
  local label="$1" value="$2"
  [[ -n "$value" ]] || die "$label cannot be empty"
  [[ "$value" == /* ]] || die "$label must be an absolute path: $value"
  [[ "$value" != "/" ]] || die "$label cannot be /"
  [[ "$(realpath -m -- "$value")" != / ]] || die "$label cannot resolve to /"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "$label cannot contain newlines"
}

validate_http_url() {
  local label="$1" value="$2"
  [[ "$value" =~ ^https?://[^/?#@[:space:]]+(/[^[:space:]]*)?$ ]] || die "$label must be an http:// or https:// URL with a hostname and no embedded credentials"
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
  local octet
  local -a octets
  IFS=. read -r -a octets <<<"$1"
  for octet in "${octets[@]}"; do
    ((10#$octet <= 255)) || die "Bind address octets must be between 0 and 255"
  done
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
  [[ "$(docker compose up --help)" == *--wait-timeout* ]] || die "Your Docker Compose plugin is too old. Upgrade it to a version supporting up --wait --wait-timeout."
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
  [[ "$(docker compose up --help)" == *--wait-timeout* ]] || die "Your Docker Compose plugin is too old. Upgrade it to a version supporting up --wait --wait-timeout."

  [[ "$(uname -s)" == "Linux" ]] || die "This guided installer currently supports Linux hosts only."
  say "  [ok] Linux"

  case "$(uname -m)" in
    x86_64|amd64) say "  [ok] amd64 architecture" ;;
    *) die "This repository currently publishes linux/amd64 images only; unsupported architecture: $(uname -m)" ;;
  esac

  require_command openssl
  say "  [ok] OpenSSL"
  require_command timeout
  require_command realpath
  require_command awk
  require_command df

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
  printf '%s="%s"\n' "$key" "$value"
}

yaml_quote() {
  local value="$1"
  value=${value//\'/\'\'}
  value=${value//\$/\$\$}
  printf "'%s'" "$value"
}

# Read our dotenv format as data. Never source an operator-controlled env file.
read_env_value() {
  local file="$1" key="$2" line value char quote decoded="" escaped=0 closed=0
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ "$line" == export[[:space:]]* ]]; then
      line="${line#export}"
      line="${line#"${line%%[![:space:]]*}"}"
    fi
    [[ "$line" == "$key="* ]] || continue
    value="${line#*=}"
    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "$value" == \"* || "$value" == \'* ]]; then
      quote="${value:0:1}"
      value="${value:1}"
      while [[ -n "$value" ]]; do
        char="${value:0:1}"; value="${value:1}"
        if ((escaped)); then
          if [[ "$quote" == "'" ]]; then
            if [[ "$char" == "'" ]]; then decoded+="$char"; else decoded+="\\$char"; fi
          else
            case "$char" in
              '"'|'\'|'$'|'`') decoded+="$char" ;;
              n) decoded+=$'\n' ;;
              r) decoded+=$'\r' ;;
              t) decoded+=$'\t' ;;
              *) decoded+="\\$char" ;;
            esac
          fi
          escaped=0
        elif [[ "$char" == '\' ]]; then escaped=1
        elif [[ "$char" == "$quote" ]]; then closed=1; break
        else decoded+="$char"; fi
      done
      ((closed)) || die "Unterminated quote in $key in $file"
      [[ "$value" =~ ^[[:space:]]*(#.*)?$ ]] || die "Unexpected text after $key in $file"
      printf '%s' "$decoded"
    else
      # Plain values are literal here, including shell metacharacters.
      value="${value%%[[:space:]]#*}"
      value="${value%"${value##*[![:space:]]}"}"
      printf '%s' "$value"
    fi
    return 0
  done <"$file"
}

load_existing_config() {
  local key value line
  EXISTING_INSTALL=1
  DATA_DIR="${DATA_DIR:-$(head -n 1 "$INSTALL_DIR/.data-dir" 2>/dev/null || true)}"
  DATA_MODE="${DATA_MODE:-existing}"
  PUBLIC_URL="${PUBLIC_URL:-$(read_env_value "$INSTALL_DIR/app.env" NEXTAUTH_URL)}"
  if ((SIGNUPS_EXPLICIT == 0)); then
    DISABLE_SIGNUPS="$(read_env_value "$INSTALL_DIR/app.env" DISABLE_SIGNUPS)"
    DISABLE_SIGNUPS="${DISABLE_SIGNUPS:-false}"
  fi
  for key in AI_MODE ACCESS_MODE; do
    if [[ "$key" == ACCESS_MODE ]] && ((PUBLIC_URL_SET)); then continue; fi
    value="$(read_env_value "$INSTALL_DIR/.installer-state" "$key")"
    if [[ -z "${!key}" && -n "$value" ]]; then printf -v "$key" '%s' "$value"; fi
  done
  # v2 deployments have no metadata file. Recover their generated service choices.
  value="$(read_env_value "$INSTALL_DIR/app.env" MEILI_ADDR)"
  if ((SEARCH_MODE_SET == 0)); then
    case "$value" in
      '') SEARCH_MODE=disabled ;;
      http://meilisearch:7700) SEARCH_MODE=managed ;;
      *) SEARCH_MODE=external ;;
    esac
  fi
  MEILI_URL="${MEILI_URL:-$value}"
  value="$(read_env_value "$INSTALL_DIR/workers.env" BROWSERLESS_URL)"
  RENDERER_URL="${RENDERER_URL:-$value}"
  if [[ -n "$value" ]]; then PREVIOUS_RENDERER_MODE=external
  elif [[ "$(read_env_value "$INSTALL_DIR/workers.env" CRAWLER_HEADLESS_BROWSER)" == false ]]; then PREVIOUS_RENDERER_MODE=disabled
  else PREVIOUS_RENDERER_MODE=managed; fi
  if ((RENDERER_MODE_SET == 0)); then RENDERER_MODE="$PREVIOUS_RENDERER_MODE"; fi
  for key in NEXTAUTH_SECRET MEILI_MASTER_KEY OPENAI_API_KEY OPENAI_BASE_URL INFERENCE_TEXT_MODEL INFERENCE_IMAGE_MODEL BROWSERLESS_TOKEN; do
    value="$(read_env_value "$INSTALL_DIR/workers.env" "$key")"
    [[ -n "$value" ]] || value="$(read_env_value "$INSTALL_DIR/app.env" "$key")"
    local input_key="KARAKEEP_$key"
    if [[ ! -v "$input_key" && -n "$value" ]]; then printf -v "$input_key" '%s' "$value"; fi
  done
  if [[ -n "$(read_env_value "$INSTALL_DIR/app.env" OPENAI_API_KEY)$(read_env_value "$INSTALL_DIR/workers.env" OPENAI_API_KEY)" ]]; then PREVIOUS_AI_MODE=openai; else PREVIOUS_AI_MODE=deferred; fi
  if ((AI_MODE_SET == 0)); then
    if [[ "$PREVIOUS_AI_MODE" == openai ]]; then AI_MODE=openai
    elif [[ "$AI_MODE" != disabled ]]; then AI_MODE=deferred; fi
  fi
  local service=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]{2}([a-z]+):[[:space:]]*$ ]]; then service="${BASH_REMATCH[1]}"; fi
    if [[ "$line" =~ ^[[:space:]]+image:[[:space:]]+(.+)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value%%[[:space:]]#*}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
      [[ -n "$value" && "$value" != *[[:space:]]* ]] || die "Cannot preserve a complex image expression. Use a single image reference in the generated Compose file."
      case "$service" in
        web) WEB_IMAGE="$value" ;;
        workers) WORKERS_IMAGE="$value" ;;
        meilisearch) MEILI_IMAGE="$value" ;;
        chrome) CHROME_IMAGE="$value" ;;
      esac
    fi
  done <"$INSTALL_DIR/docker-compose.yml"
  # Only recognize the simple port mapping generated by v2. Fail rather than reset a custom mapping.
  if [[ -z "$PORT" || -z "$BIND_ADDRESS" ]]; then
    while IFS= read -r line; do
      if [[ "$line" =~ ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+):3000 ]]; then
        BIND_ADDRESS="${BIND_ADDRESS:-${BASH_REMATCH[1]}}"
        PORT="${PORT:-${BASH_REMATCH[2]}}"
        break
      fi
    done <"$INSTALL_DIR/docker-compose.yml"
    [[ -n "$PORT" && -n "$BIND_ADDRESS" ]] || die "Cannot recover the existing port mapping. Supply --port and --bind-address explicitly."
  fi
  if [[ -z "$ACCESS_MODE" ]]; then
    if [[ "$PUBLIC_URL" == https://* ]]; then ACCESS_MODE=domain
    elif [[ "$BIND_ADDRESS" != 127.0.0.1 ]]; then ACCESS_MODE=lan
    else ACCESS_MODE=local; fi
  fi
}

prepare_existing_install() {
  if [[ -e "$INSTALL_DIR/docker-compose.yml" || -e "$INSTALL_DIR/app.env" || -e "$INSTALL_DIR/workers.env" ]]; then
    if ((RECONFIGURE == 0 && NON_INTERACTIVE == 0)); then
      prompt_yes_no "Configuration exists. Back it up and reconfigure it, keeping current values as defaults?" no && RECONFIGURE=1
    fi
    ((RECONFIGURE)) || die "Generated configuration already exists in $INSTALL_DIR. Rerun with --reconfigure to back it up and replace it explicitly."
    [[ -f "$INSTALL_DIR/docker-compose.yml" && -f "$INSTALL_DIR/app.env" && -f "$INSTALL_DIR/workers.env" ]] || die "Existing configuration is incomplete. Restore its configuration backup before reconfiguring."
    load_existing_config
  fi
}

# Keep custom settings verbatim; replace or remove only settings owned by service choices.
merge_env_file() {
  local old="$1" generated="$2" owned="$3"
  [[ -f "$old" ]] || return 0
  awk -v owned="$owned" '
    BEGIN { split(owned, keys, " "); for (i in keys) managed[keys[i]]=1 }
    FNR==NR { key=$0; sub(/=.*/, "", key); replacement[key]=$0; order[++n]=key; next }
    { key=$0; sub(/^[[:space:]]*(export[[:space:]]+)?/, "", key); sub(/=.*/, "", key)
      if (key in managed) { if ((key in replacement) && !seen[key]++) print replacement[key] }
      else { print; seen[key]=1 }
    }
    END { for (i=1;i<=n;i++) if (!seen[order[i]]) print replacement[order[i]] }
  ' "$generated" "$old" >"$generated.merged"
  mv "$generated.merged" "$generated"
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
      install|update|backup|start|stop|status|doctor|uninstall)
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
      --access) [[ $# -ge 2 ]] || die "--access requires a value"; ACCESS_MODE="$2"; shift 2 ;;
      --wait-timeout) [[ $# -ge 2 ]] || die "--wait-timeout requires a value"; WAIT_TIMEOUT="$2"; shift 2 ;;
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
  if [[ "$COMMAND" != install ]] && ((DRY_RUN || NO_START || RECONFIGURE)); then
    die "--dry-run, --no-start, and --reconfigure are install options, not management command options"
  fi
  [[ "$WAIT_TIMEOUT" =~ ^[1-9][0-9]{0,4}$ ]] || die "Readiness timeout must be a positive number of seconds (at most 99999)"
}

apply_defaults() {
  INSTALL_DIR="$(realpath -m -- "$(expand_path "${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")")"
  DATA_DIR="$(realpath -m -- "$(expand_path "${DATA_DIR:-$INSTALL_DIR/data}")")"
  PORT="${PORT:-$DEFAULT_PORT}"
  if [[ "$ACCESS_MODE" == lan ]]; then BIND_ADDRESS="${BIND_ADDRESS:-0.0.0.0}"
  else BIND_ADDRESS="${BIND_ADDRESS:-$DEFAULT_BIND_ADDRESS}"; fi
  PUBLIC_URL="${PUBLIC_URL:-http://localhost:$PORT}"
  PUBLIC_URL="${PUBLIC_URL%/}"
  if [[ -z "$ACCESS_MODE" ]]; then
    if [[ "$BIND_ADDRESS" != 127.0.0.1 ]]; then ACCESS_MODE=lan
    elif [[ "$PUBLIC_URL" == http://localhost:* || "$PUBLIC_URL" == http://127.0.0.1:* ]]; then ACCESS_MODE=local
    else ACCESS_MODE=domain; fi
  fi
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

  INSTALL_DIR="$(expand_path "$(prompt_text "Install directory" "${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")")"
  prepare_existing_install

  local setup_label="Use the recommended Marka setup?"
  if ((EXISTING_INSTALL)); then setup_label="Keep the current service choices?"; fi
  if prompt_yes_no "$setup_label" "yes"; then
    recommended=1
  else
    say ""
    say "Advanced configuration selected."
    say "External Meilisearch should be dedicated to this Marka instance; sharing one Meilisearch index across multiple Marka deployments is not supported by this installer."
    say ""
  fi

  DATA_DIR="$(expand_path "$(prompt_text "Persistent data directory" "${DATA_DIR:-$INSTALL_DIR/data}")")"

  if [[ -d "$DATA_DIR" && -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]; then
    DATA_MODE="$(prompt_choice "The data directory is not empty. Treat it as an existing compatible Marka data directory?" "existing fresh" "existing")"
  elif ((EXISTING_INSTALL)); then
    DATA_MODE=existing
  elif ((recommended)); then
    DATA_MODE="fresh"
  else
    DATA_MODE="$(prompt_choice "Data mode" "fresh existing" "fresh")"
  fi
  DATA_MODE_SET=1

  say ""
  say "How will you open Marka?"
  say "  local:  this server only, or an SSH tunnel from your laptop"
  say "  lan:    other devices on your trusted network (HTTP, no TLS)"
  say "  domain: your HTTPS domain through a reverse proxy you manage"
  if [[ -z "$ACCESS_MODE" && "$PUBLIC_URL" == https://* ]]; then ACCESS_MODE=domain; fi
  local previous_access="$ACCESS_MODE" previous_bind="$BIND_ADDRESS" previous_port="$PORT" previous_url="$PUBLIC_URL"
  ACCESS_MODE="$(prompt_choice "Access" "local lan domain" "${ACCESS_MODE:-local}")"
  PORT="$(prompt_text "Host port" "${PORT:-$DEFAULT_PORT}")"
  case "$ACCESS_MODE" in
    local) BIND_ADDRESS=127.0.0.1; PUBLIC_URL="http://localhost:$PORT" ;;
    lan) BIND_ADDRESS=0.0.0.0; PUBLIC_URL="$(prompt_text "LAN application URL, for example http://192.168.1.10:$PORT" "${PUBLIC_URL:-}")" ;;
    domain) BIND_ADDRESS=127.0.0.1; PUBLIC_URL="$(prompt_text "Public HTTPS URL, for example https://keep.example.com" "${PUBLIC_URL:-}")" ;;
  esac
  if ((EXISTING_INSTALL)) && [[ "$ACCESS_MODE" == "$previous_access" ]]; then
    BIND_ADDRESS="$previous_bind"
    if [[ "$ACCESS_MODE" == local && "$PORT" == "$previous_port" ]]; then PUBLIC_URL="$previous_url"; fi
  fi
  PUBLIC_URL="${PUBLIC_URL%/}"
  PUBLIC_URL_SET=1

  if ((recommended)); then
    SEARCH_MODE="${SEARCH_MODE:-$DEFAULT_SEARCH_MODE}"
    RENDERER_MODE="${RENDERER_MODE:-$DEFAULT_RENDERER_MODE}"
    AI_MODE="${AI_MODE:-$DEFAULT_AI_MODE}"
    SEARCH_MODE_SET=1
    RENDERER_MODE_SET=1
    AI_MODE_SET=1

    say ""
    say "Using service configuration:"
    say "  Host bind:  $BIND_ADDRESS:$PORT"
    say "  Search:     $SEARCH_MODE"
    say "  Renderer:   $RENDERER_MODE"
    say "  AI:         $AI_MODE"
  else
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

  if [[ "$AI_MODE" == openai && -z "${KARAKEEP_OPENAI_API_KEY:-}" ]]; then
    KARAKEEP_OPENAI_API_KEY="$(prompt_secret "OpenAI-compatible API key")"
    export KARAKEEP_OPENAI_API_KEY
  fi

  if [[ "$DATA_MODE" == "existing" ]]; then
    local signup_default=yes
    if [[ "$DISABLE_SIGNUPS" == false ]]; then signup_default=no; fi
    if prompt_yes_no "Disable new signups now?" "$signup_default"; then
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
  [[ "$INSTALL_DIR/" != "$DATA_DIR/"* ]] || die "Install directory cannot be inside the data directory. Use a separate data directory, such as <install-dir>/data."
  validate_http_url "Public URL" "$PUBLIC_URL"
  validate_port "$PORT"
  validate_bind_address "$BIND_ADDRESS"
  validate_choice "Data mode" "$DATA_MODE" "fresh existing"
  validate_choice "Search mode" "$SEARCH_MODE" "managed external disabled"
  validate_choice "Renderer mode" "$RENDERER_MODE" "managed external disabled"
  validate_choice "AI mode" "$AI_MODE" "disabled openai deferred"
  validate_choice "Access mode" "$ACCESS_MODE" "local lan domain"
  local input_key
  for input_key in KARAKEEP_NEXTAUTH_SECRET KARAKEEP_MEILI_MASTER_KEY KARAKEEP_BROWSERLESS_TOKEN KARAKEEP_OPENAI_API_KEY KARAKEEP_OPENAI_BASE_URL KARAKEEP_INFERENCE_TEXT_MODEL KARAKEEP_INFERENCE_IMAGE_MODEL; do
    if [[ -v "$input_key" ]]; then secret_value_is_safe "$input_key" "${!input_key}"; fi
  done
  [[ "$WAIT_TIMEOUT" =~ ^[1-9][0-9]{0,4}$ ]] || die "Readiness timeout must be a positive number of seconds (at most 99999)"
  if [[ "$ACCESS_MODE" == domain ]]; then
    [[ "$PUBLIC_URL" == https://* ]] || die "Domain access requires a public HTTPS URL. Use --access local or lan for HTTP."
  elif [[ "$ACCESS_MODE" == lan ]]; then
    [[ "$PUBLIC_URL" != http://localhost* && "$PUBLIC_URL" != http://127.0.0.1* ]] || die "LAN access requires a URL other devices can reach, for example http://192.168.1.10:$PORT"
  elif [[ "$ACCESS_MODE" == local ]]; then
    [[ "$PUBLIC_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]] || die "Local access requires an http://localhost or http://127.0.0.1 URL. Choose domain or lan for other addresses."
  fi

  if ((NON_INTERACTIVE && EXISTING_INSTALL == 0)); then
    ((PUBLIC_URL_SET && DATA_MODE_SET && SEARCH_MODE_SET && RENDERER_MODE_SET && AI_MODE_SET)) || \
      die "--non-interactive requires explicit --public-url, --data-mode, --search, --renderer, and --ai choices"
  fi

  if [[ -n "${KARAKEEP_MEILI_MASTER_KEY:-}" ]]; then secret_value_is_safe KARAKEEP_MEILI_MASTER_KEY "$KARAKEEP_MEILI_MASTER_KEY"; fi
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
  Access:            $ACCESS_MODE
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
    deferred) say "AI is disabled for now. Enable it later with install.sh --reconfigure and advanced setup." ;;
  esac

  say ""
  say "The installer will not configure DNS, TLS certificates, a reverse proxy, firewall rules, or Docker itself."
}

validate_storage() {
  local path ancestor available
  if [[ "$DATA_MODE" == fresh ]]; then
    if [[ -d "$DATA_DIR" && -n "$(find "$DATA_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      die "Fresh data mode refuses to use non-empty directory $DATA_DIR. Use --data-mode existing only for a compatible Marka data directory."
    fi
  else
    [[ -d "$DATA_DIR" ]] || die "Existing data mode requires the data directory to already exist: $DATA_DIR"
  fi
  for path in "$INSTALL_DIR" "$DATA_DIR"; do
    ancestor="$path"
    while [[ ! -e "$ancestor" ]]; do ancestor="$(dirname "$ancestor")"; done
    [[ -d "$ancestor" && -w "$ancestor" && -x "$ancestor" ]] || die "Cannot write to $path. Choose a directory owned by the current user or fix its permissions."
    available="$(df -Pk "$ancestor" | awk 'END {print $4}')"
    if [[ "$available" =~ ^[0-9]+$ ]] && ((available < 2097152)); then
      warn "Less than 2 GiB free on the filesystem containing $path. Allow room for downloads, bookmarks, and backups."
    fi
  done
  local memory
  memory="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if [[ "$memory" =~ ^[0-9]+$ ]] && ((memory < 2097152)); then
    warn "Less than 2 GiB RAM is available. Managed search and Chrome may need more memory under load."
  fi
}

validate_project_and_port() {
  local owner published probe_address
  owner="$(docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --format '{{.Label "com.docker.compose.project.working_dir"}}')"
  if [[ -n "$owner" ]]; then
    while IFS= read -r published; do
      [[ "$(realpath -m -- "$published")" == "$INSTALL_DIR" ]] || die "Compose project $COMPOSE_PROJECT_NAME already exists in another directory. Manage that installation instead of starting a second one."
    done <<<"$owner"
  fi
  probe_address="$BIND_ADDRESS"
  [[ "$probe_address" != 0.0.0.0 ]] || probe_address=127.0.0.1
  if timeout 2 bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$probe_address" "$PORT" 2>/dev/null; then
    published=""
    if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
      published="$(compose_in_install_dir port web 3000 2>/dev/null || true)"
    fi
    [[ "$published" == "$BIND_ADDRESS:$PORT" ]] || die "Port $BIND_ADDRESS:$PORT is already in use. Choose another --port, or stop the service using it."
  fi
}

backup_existing_config() {
  local stamp backup_root
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$INSTALL_DIR/config-backups"
  backup_root="$(mktemp -d "$INSTALL_DIR/config-backups/$stamp-XXXXXX")"
  chmod 700 "$INSTALL_DIR/config-backups" "$backup_root"
  local file
  for file in docker-compose.yml docker-compose.override.yml docker-compose.override.yaml app.env workers.env meilisearch.env .data-dir .installer-state .installed-images install.sh; do
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
  if ((EXISTING_INSTALL)) && [[ "$RENDERER_MODE" == "$PREVIOUS_RENDERER_MODE" ]]; then
    screenshot_enabled="$(read_env_value "$INSTALL_DIR/app.env" CRAWLER_STORE_SCREENSHOT)"
    screenshot_enabled="${screenshot_enabled:-true}"
  fi
  if [[ "$AI_MODE" == "openai" ]]; then auto_tag="true"; auto_summary="true"; else auto_tag="false"; auto_summary="false"; fi
  if ((EXISTING_INSTALL)) && [[ "$AI_MODE" == "$PREVIOUS_AI_MODE" ]]; then
    auto_tag="$(read_env_value "$INSTALL_DIR/app.env" INFERENCE_ENABLE_AUTO_TAGGING)"
    auto_summary="$(read_env_value "$INSTALL_DIR/app.env" INFERENCE_ENABLE_AUTO_SUMMARIZATION)"
    auto_tag="${auto_tag:-false}"; auto_summary="${auto_summary:-false}"
  fi

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
    if [[ "$AI_MODE" == "openai" ]]; then
      dotenv_line OPENAI_API_KEY "$KARAKEEP_OPENAI_API_KEY"
      if [[ -n "${KARAKEEP_OPENAI_BASE_URL:-}" ]]; then dotenv_line OPENAI_BASE_URL "$KARAKEEP_OPENAI_BASE_URL"; fi
      if [[ -n "${KARAKEEP_INFERENCE_TEXT_MODEL:-}" ]]; then dotenv_line INFERENCE_TEXT_MODEL "$KARAKEEP_INFERENCE_TEXT_MODEL"; fi
      if [[ -n "${KARAKEEP_INFERENCE_IMAGE_MODEL:-}" ]]; then dotenv_line INFERENCE_IMAGE_MODEL "$KARAKEEP_INFERENCE_IMAGE_MODEL"; fi
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

  } >"$tmp_dir/workers.env"
  if [[ "$SEARCH_MODE" == managed ]]; then
    dotenv_line MEILI_MASTER_KEY "$meili_key" >"$tmp_dir/meilisearch.env"
    chmod 600 "$tmp_dir/meilisearch.env"
  fi

  if ((EXISTING_INSTALL)); then
    local ai_keys="OPENAI_API_KEY OPENAI_BASE_URL INFERENCE_TEXT_MODEL INFERENCE_IMAGE_MODEL INFERENCE_ENABLE_AUTO_TAGGING INFERENCE_ENABLE_AUTO_SUMMARIZATION"
    merge_env_file "$INSTALL_DIR/app.env" "$tmp_dir/app.env" "NEXTAUTH_URL NEXTAUTH_SECRET DISABLE_SIGNUPS MEILI_ADDR MEILI_MASTER_KEY CRAWLER_STORE_SCREENSHOT $ai_keys"
    merge_env_file "$INSTALL_DIR/workers.env" "$tmp_dir/workers.env" "WORKER_PROFILE BROWSER_WEB_URL BROWSERLESS_URL BROWSERLESS_TOKEN BROWSER_CONNECT_ONDEMAND CRAWLER_HEADLESS_BROWSER $ai_keys"
  fi

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
    say "      WORKERS_HOST: 0.0.0.0"
    say "      WORKERS_PORT: 3001"
    say "    healthcheck:"
    say '      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3001/ready"]'
    say "      interval: 5s"
    say "      timeout: 5s"
    say "      start_period: 10s"
    say "      retries: 30"
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
      say "      - ./meilisearch.env"
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
  {
    local key
    for key in PORT BIND_ADDRESS SEARCH_MODE RENDERER_MODE AI_MODE ACCESS_MODE; do dotenv_line "$key" "${!key}"; done
  } >"$tmp_dir/.installer-state"
  chmod 600 "$tmp_dir/app.env" "$tmp_dir/workers.env" "$tmp_dir/.data-dir" "$tmp_dir/.installer-state"
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

install_command() (
  preflight_install

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -z "$INSTALL_DIR" && -f "$script_dir/docker-compose.yml" ]]; then INSTALL_DIR="$script_dir"; fi
  INSTALL_DIR="$(realpath -m -- "$(expand_path "${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}")")"
  if ((NON_INTERACTIVE == 0)); then
    interactive_configure
  else
    prepare_existing_install
  fi

  apply_defaults
  validate_install_config
  validate_storage
  validate_project_and_port
  print_plan

  if ((DRY_RUN)); then
    say ""
    info "Dry run complete. No files were written and no containers were changed."
    return 0
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
  trap 'rm -rf "$tmp_dir"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  write_generated_files "$tmp_dir"
  copy_self "$tmp_dir"

  if ! docker compose -f "$tmp_dir/docker-compose.yml" config --quiet >/dev/null 2>&1; then
    die "Generated Compose validation failed. Check your env-file syntax. Existing configuration has not been replaced."
  fi

  mv "$tmp_dir/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  mv "$tmp_dir/app.env" "$INSTALL_DIR/app.env"
  mv "$tmp_dir/workers.env" "$INSTALL_DIR/workers.env"
  mv "$tmp_dir/.data-dir" "$INSTALL_DIR/.data-dir"
  mv "$tmp_dir/.installer-state" "$INSTALL_DIR/.installer-state"
  if [[ -f "$tmp_dir/meilisearch.env" ]]; then mv "$tmp_dir/meilisearch.env" "$INSTALL_DIR/meilisearch.env"
  else rm -f "$INSTALL_DIR/meilisearch.env"; fi
  if [[ -f "$tmp_dir/install.sh" ]]; then mv "$tmp_dir/install.sh" "$INSTALL_DIR/install.sh"; fi
  rmdir "$tmp_dir"
  trap - EXIT INT TERM

  info "Configuration written to $INSTALL_DIR"

  if ((NO_START)); then
    info "Configuration validated. Containers were not started because --no-start was supplied."
  else
    validate_compose
    if ((EXISTING_INSTALL)); then
      info "Applying configuration with locally available images. Use install.sh update to check for newer images."
    else
      info "Downloading application and selected service images..."
      pull_images
    fi
    start_stack
    record_images
  fi

  say ""
  say "Next steps:"
  case "$ACCESS_MODE" in
    local)
      say "  Open $PUBLIC_URL on this server. localhost on your laptop refers to your laptop."
      say "  For a remote server, open an SSH tunnel from your laptop:"
      say "    ssh -N -L $PORT:127.0.0.1:$PORT <user>@<server>"
      say "  Then open $PUBLIC_URL on your laptop."
      ;;
    domain) say "  Configure DNS and your reverse proxy/TLS endpoint to forward $PUBLIC_URL to $BIND_ADDRESS:$PORT." ;;
    lan) say "  Open $PUBLIC_URL from a device on your trusted network. Keep this HTTP listener off the public Internet." ;;
  esac
  if ((NO_START)); then printf '  Start the deployment first with: %q start\n' "$INSTALL_DIR/install.sh"; fi
  if [[ "$DATA_MODE" == fresh ]]; then say "  Create your first administrator account when the app is reachable."; fi
  if [[ "$DATA_MODE" == "fresh" && "$DISABLE_SIGNUPS" == "false" ]]; then
    printf '  After the first account exists, close signups with: %q --non-interactive --reconfigure --disable-signups\n' "$INSTALL_DIR/install.sh"
  else
    say "  Confirm the configured signup policy matches your instance."
  fi
  printf '  Check readiness: %q doctor\n' "$INSTALL_DIR/install.sh"
  printf '  Create a backup: %q backup\n' "$INSTALL_DIR/install.sh"
  printf '  Update later:    %q update\n' "$INSTALL_DIR/install.sh"
  say ""
  say "Persistent application data lives at $DATA_DIR and is never removed by the uninstall command."
)

management_install_dir() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -z "$INSTALL_DIR" && -f "$script_dir/docker-compose.yml" ]]; then
    INSTALL_DIR="$script_dir"
  elif [[ -z "$INSTALL_DIR" && -f "$HOME/marka/docker-compose.yml" ]]; then
    INSTALL_DIR="$HOME/marka"
  elif [[ -z "$INSTALL_DIR" && -f "$HOME/karakeep/docker-compose.yml" ]]; then
    # Keep existing guided installations manageable after the default moves to Marka.
    INSTALL_DIR="$HOME/karakeep"
  else
    INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  fi
  INSTALL_DIR="$(realpath -m -- "$(expand_path "$INSTALL_DIR")")"
  validate_path "Install directory" "$INSTALL_DIR"
  [[ -f "$INSTALL_DIR/docker-compose.yml" ]] || die "No guided Marka installation found at $INSTALL_DIR"
}

compose_in_install_dir() {
  (
    cd "$INSTALL_DIR"
    docker compose "$@"
  )
}

validate_compose() {
  compose_in_install_dir config --quiet >/dev/null 2>&1 || die "Compose configuration is invalid. Check local env and override files. Configuration values were not printed."
}

pull_images() {
  local attempt
  for attempt in 1 2 3; do
    if compose_in_install_dir pull; then return 0; fi
    if ((attempt < 3)); then
      warn "Image download failed (attempt $attempt of 3). Retrying in 2 seconds..."
      sleep 2
    fi
  done
  warn "Image download failed. Running containers were not changed. Retry when the registry is reachable."
  return 1
}

start_stack() {
  [[ "$WAIT_TIMEOUT" =~ ^[1-9][0-9]{0,4}$ ]] || die "Readiness timeout must be a positive number of seconds (at most 99999)"
  info "Waiting up to $WAIT_TIMEOUT seconds for web and workers to become healthy..."
  if ! compose_in_install_dir up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT"; then
    compose_in_install_dir ps --all >&2 || true
    printf 'Readiness failed. Check services with: %q doctor\n' "$INSTALL_DIR/install.sh" >&2
    printf 'Inspect local logs with: docker compose --project-directory %q logs --tail 100\n' "$INSTALL_DIR" >&2
    return 1
  fi
  if ! compose_in_install_dir exec -T web wget -q --spider http://127.0.0.1:3000/api/health ||
     ! compose_in_install_dir exec -T workers wget -q --spider http://127.0.0.1:3001/ready; then
    warn "Application readiness probes failed. Run install.sh doctor. Older guided configs need --reconfigure once to enable the worker probe."
    return 1
  fi
  info "Marka web and workers are ready. Public DNS/TLS reachability still depends on your network setup."
}

record_images() {
  (umask 077; compose_in_install_dir images --format json >"$INSTALL_DIR/.installed-images.tmp")
  mv "$INSTALL_DIR/.installed-images.tmp" "$INSTALL_DIR/.installed-images"
}

wait_for_container() {
  local container="$1" state deadline=$((SECONDS + WAIT_TIMEOUT))
  while ((SECONDS < deadline)); do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null)" || return 1
    case "$state" in
      healthy|running) return 0 ;;
      exited|dead) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

update_command() {
  check_platform
  management_install_dir
  check_docker
  info "Pulling configured service images before backing up and applying the update..."
  validate_compose
  pull_images
  record_images
  backup_existing_config
  backup_command
  start_stack
  record_images
  info "Update complete. Configuration, previous image IDs, and a data backup are available for recovery. Restore matching data if reverting across database migrations."
}

backup_command() (
  umask 077
  check_platform
  management_install_dir
  check_docker
  require_command tar
  [[ -f "$INSTALL_DIR/.data-dir" ]] || die "Missing $INSTALL_DIR/.data-dir; cannot determine the persistent data directory safely."
  DATA_DIR="$(realpath -m -- "$(head -n 1 "$INSTALL_DIR/.data-dir")")"
  validate_path "Data directory" "$DATA_DIR"
  [[ -d "$DATA_DIR" ]] || die "Data directory does not exist: $DATA_DIR"

  BACKUP_DIR="$(expand_path "${BACKUP_DIR:-$INSTALL_DIR/backups}")"
  validate_path "Backup directory" "$BACKUP_DIR"
  # A nested backup would archive itself and grow without bound.
  local resolved_data resolved_backup
  resolved_data="$(realpath -m "$DATA_DIR")"
  resolved_backup="$(realpath -m "$BACKUP_DIR")"
  [[ "$resolved_backup/" != "$resolved_data/"* ]] || die "Backup directory must be outside the application data directory"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  local stamp archive web_was_running workers_was_running backup_complete=0
  local -a resume=()
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  archive="$(mktemp "$BACKUP_DIR/marka-data-$stamp-XXXXXX.tar.gz")"
  web_was_running="$(compose_in_install_dir ps --status running -q web || true)"
  workers_was_running="$(compose_in_install_dir ps --status running -q workers || true)"
  [[ -z "$web_was_running" ]] || resume+=(web)
  [[ -z "$workers_was_running" ]] || resume+=(workers)

  finish_backup() {
    local result=$? container
    trap - EXIT
    if ((${#resume[@]})); then
      if compose_in_install_dir start "${resume[@]}" >/dev/null; then
        while IFS= read -r container; do
          [[ -n "$container" ]] || continue
          wait_for_container "$container" || { warn "A restarted service did not become healthy. Run install.sh doctor."; result=1; }
        done <<<"$web_was_running"$'\n'"$workers_was_running"
      else
        warn "Could not restart the previously running services. Run install.sh start."
        result=1
      fi
    fi
    if ((backup_complete == 0)); then rm -f "$archive" "$archive.partial"; fi
    exit "$result"
  }
  trap finish_backup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  info "Stopping web/workers briefly for a consistent SQLite/assets backup..."
  compose_in_install_dir stop workers web >/dev/null
  tar -C "$(dirname "$DATA_DIR")" -czf "$archive.partial" "$(basename "$DATA_DIR")"
  mv "$archive.partial" "$archive"
  chmod 600 "$archive"
  backup_complete=1

  info "Backup written to $archive"
  say "Meilisearch data is not included because it is a derived search index; the authoritative SQLite/assets state is in this archive."
)

start_command() {
  check_platform
  management_install_dir
  check_docker
  validate_compose
  start_stack
  record_images
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

doctor_command() {
  check_platform
  management_install_dir
  check_docker
  validate_compose
  compose_in_install_dir ps --all
  local failed=0
  if compose_in_install_dir exec -T web wget -q --spider http://127.0.0.1:3000/api/health; then
    say "[ok] Web health"
  else warn "Web is not healthy. Check its container status and local logs."; failed=1; fi
  if compose_in_install_dir exec -T workers wget -q --spider http://127.0.0.1:3001/ready; then
    say "[ok] Worker readiness"
  else warn "Workers are not ready. Older guided installations need --reconfigure once to enable this probe."; failed=1; fi
  return "$failed"
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
    doctor) doctor_command ;;
    uninstall) uninstall_command ;;
    *) die "Unsupported command: $COMMAND" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
