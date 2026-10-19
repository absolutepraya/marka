#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="$SCRIPT_DIR/install.sh"

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

make_fake_docker() {
  local dir="$1"
  mkdir -p "$dir"
  cat >"$dir/docker" <<'EOF_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${FAKE_DOCKER_LOG:-}" ]]; then printf '%q ' "$@" >>"$FAKE_DOCKER_LOG"; printf '\n' >>"$FAKE_DOCKER_LOG"; fi
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then exit 0; fi
if [[ "$*" == 'compose up --help' ]]; then printf '%s\n' '--wait --wait-timeout'; exit 0; fi
if [[ "${1:-}" == "info" ]]; then
  [[ "${FAKE_DOCKER_INFO_FAIL:-0}" == "1" ]] && exit 1
  exit 0
fi
if [[ "${1:-}" == ps ]]; then printf '%s' "${FAKE_PROJECT_OWNER:-}"; exit 0; fi
if [[ "${1:-}" == inspect ]]; then printf '%s' "${FAKE_HEALTH_STATUS:-healthy}"; exit 0; fi
if [[ "${1:-}" == "compose" ]]; then
  if [[ "${2:-}" == pull && "${FAKE_PULL_FAIL:-0}" == 1 ]]; then exit 1; fi
  if [[ "${2:-}" == port ]]; then printf '%s' "${FAKE_PUBLISHED_PORT:-}"; exit 0; fi
  if [[ " $* " == *" ps --status running -q "* ]]; then
    if [[ " ${FAKE_RUNNING:-} " == *" ${*: -1} "* ]]; then printf 'container-id\n'; fi
    exit 0
  fi
  if [[ " $* " == *" config --quiet "* && "${FAKE_CONFIG_FAIL:-0}" == 1 ]]; then exit 1; fi
  if [[ " $* " == *" up -d "* && "${FAKE_UP_FAIL:-0}" == 1 ]]; then exit 1; fi
  if [[ "${2:-}" == start && "${FAKE_START_FAIL:-0}" == 1 ]]; then exit 1; fi
  exit 0
fi
exit 0
EOF_DOCKER
  chmod +x "$dir/docker"
}

make_fake_uname_only() {
  local dir="$1"
  mkdir -p "$dir"
  cat >"$dir/uname" <<'EOF_UNAME'
#!/usr/bin/env bash
case "${1:-}" in
  -s) printf 'Linux\n' ;;
  -m) printf 'x86_64\n' ;;
  *) printf 'Linux\n' ;;
esac
EOF_UNAME
  chmod +x "$dir/uname"
}

bash -n "$INSTALLER"
help_output="$(bash "$INSTALLER" --help)"
assert_contains "$help_output" "--non-interactive"
assert_contains "$help_output" "KARAKEEP_BROWSERLESS_TOKEN"
assert_contains "$help_output" "backup"

root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fake_bin="$root/bin"
make_fake_docker "$fake_bin"
export PATH="$fake_bin:$PATH"
export FAKE_DOCKER_LOG="$root/docker.log"

# A guided install must run and display host prerequisite checks before configuration.
preflight_dir="$root/preflight"
preflight_output="$(bash "$INSTALLER" \
  --non-interactive --dry-run --yes \
  --install-dir "$preflight_dir/install" --data-dir "$preflight_dir/data" \
  --public-url https://keep.example.com --data-mode fresh \
  --search managed --renderer managed --ai deferred 2>&1)"
assert_contains "$preflight_output" "Checking host prerequisites"
assert_contains "$preflight_output" "[ok] Linux"
assert_contains "$preflight_output" "[ok] amd64 architecture"
assert_contains "$preflight_output" "[ok] Docker CLI"
assert_contains "$preflight_output" "[ok] Docker Compose v2"
assert_contains "$preflight_output" "[ok] Docker daemon access"
assert_contains "$preflight_output" "[ok] OpenSSL"
assert_not_contains "$preflight_output" "Node.js is required"

# Missing Docker must fail during preflight, even for a dry run, before configuration is written.
missing_docker_bin="$root/missing-docker-bin"
make_fake_uname_only "$missing_docker_bin"
if PATH="$missing_docker_bin" /bin/bash "$INSTALLER" \
  --non-interactive --dry-run --yes \
  --install-dir "$root/missing-docker/install" --data-dir "$root/missing-docker/data" \
  --public-url https://keep.example.com --data-mode fresh \
  --search managed --renderer managed --ai deferred >"$root/missing-docker.out" 2>&1; then
  fail "Installer unexpectedly passed preflight without Docker"
fi
assert_contains "$root/missing-docker.out" "Required command 'docker' was not found. Install it first and rerun this installer."
[[ ! -e "$root/missing-docker/install" ]] || fail "Failed preflight wrote installation files"

# Interactive setup explains defaults and offers the recommended configuration shortcut.
recommended_home="$root/recommended-home"
mkdir -p "$recommended_home"
recommended_output="$(printf '\n%.0s' {1..12} | HOME="$recommended_home" bash "$INSTALLER" --no-start 2>&1)"
assert_contains "$recommended_output" "Press Enter to accept the recommended value shown in [brackets]."
# Bash read -p only emits its prompt for terminal input, so verify the prompt itself in the script
# and the resulting configuration behavior separately when stdin is piped for this automated test.
assert_contains "$INSTALLER" "Use the recommended Marka setup?"
assert_contains "$recommended_home/marka/docker-compose.yml" "ghcr.io/karakeep-app/karakeep-chrome:release"

# Dry run must not write configuration or disclose secrets.
dry_dir="$root/dry"
dry_output="$(KARAKEEP_OPENAI_API_KEY='do-not-print-this' bash "$INSTALLER" \
  --non-interactive --dry-run --yes \
  --install-dir "$dry_dir/install" --data-dir "$dry_dir/data" \
  --public-url https://keep.example.com --data-mode fresh \
  --search managed --renderer managed --ai openai)"
assert_contains "$dry_output" "Dry run complete"
assert_not_contains "$dry_output" "do-not-print-this"
[[ ! -e "$dry_dir/install" ]] || fail "Dry run created the install directory"

# Managed defaults generate a private Chrome + Meilisearch stack.
managed="$root/managed"
bash "$INSTALLER" --non-interactive --no-start --yes \
  --install-dir "$managed/install" --data-dir "$managed/data" \
  --public-url https://keep.example.com --data-mode fresh \
  --search managed --renderer managed --ai deferred >/dev/null
assert_contains "$managed/install/docker-compose.yml" "ghcr.io/absolutepraya/marka:web-stable"
assert_contains "$managed/install/docker-compose.yml" "ghcr.io/absolutepraya/marka:workers-stable"
assert_contains "$managed/install/docker-compose.yml" "web-v<version>"
assert_contains "$managed/install/docker-compose.yml" "workers-v<version>"
assert_contains "$managed/install/docker-compose.yml" "getmeili/meilisearch:v1.41.0"
assert_contains "$managed/install/docker-compose.yml" "ghcr.io/karakeep-app/karakeep-chrome:release"
assert_contains "$managed/install/docker-compose.yml" "init: true"
assert_contains "$managed/install/docker-compose.yml" "--disable-blink-features=AutomationControlled"
assert_contains "$managed/install/docker-compose.yml" "--window-size=1440,900"
assert_not_contains "$managed/install/docker-compose.yml" "--remote-debugging-port=9222"
assert_contains "$managed/install/docker-compose.yml" "127.0.0.1:3000:3000"
assert_contains "$managed/install/app.env" 'DISABLE_SIGNUPS="false"'
assert_contains "$managed/install/workers.env" 'BROWSER_WEB_URL="http://chrome:9222"'
assert_contains "$managed/install/docker-compose.yml" 'http://127.0.0.1:3001/ready'
assert_contains "$managed/install/docker-compose.yml" 'WORKERS_HOST: 0.0.0.0'
[[ "$(stat -c '%a' "$managed/install/app.env")" == "600" ]] || fail "app.env permissions are not 600"
[[ "$(stat -c '%a' "$managed/install/workers.env")" == "600" ]] || fail "workers.env permissions are not 600"
[[ "$(stat -c '%a' "$managed/install/install.sh")" == "700" ]] || fail "installed helper permissions are not 700"

# Existing guided installs remain manageable after the default moves to Marka.
legacy_home="$root/legacy-home"
mkdir -p "$legacy_home/karakeep"
touch "$legacy_home/karakeep/docker-compose.yml"
: >"$FAKE_DOCKER_LOG"
HOME="$legacy_home" bash "$INSTALLER" status >/dev/null
assert_contains "$FAKE_DOCKER_LOG" "compose ps"

# A rerun must refuse to overwrite generated configuration unless explicitly requested.
before_hash="$(sha256sum "$managed/install/app.env" | awk '{print $1}')"
before_secret="$(sed -n '/^NEXTAUTH_SECRET=/p' "$managed/install/app.env")"
printf 'CUSTOM_OPERATOR_SETTING="preserve-this"\n' >>"$managed/install/app.env"
before_hash="$(sha256sum "$managed/install/app.env" | awk '{print $1}')"
if bash "$INSTALLER" --non-interactive --no-start --yes \
  --install-dir "$managed/install" --data-dir "$managed/data" \
  --public-url https://keep.example.com --data-mode existing \
  --search managed --renderer managed --ai deferred >/dev/null 2>&1; then
  fail "Rerun unexpectedly overwrote existing configuration"
fi
after_hash="$(sha256sum "$managed/install/app.env" | awk '{print $1}')"
[[ "$before_hash" == "$after_hash" ]] || fail "Existing configuration changed after a refused rerun"

# Explicit reconfiguration backs up the previous config first.
bash "$INSTALLER" --non-interactive --no-start --yes --reconfigure \
  --install-dir "$managed/install" --data-dir "$managed/data" \
  --public-url https://keep.example.com --data-mode existing \
  --search disabled --renderer disabled --ai disabled --disable-signups >/dev/null
backup_count="$(find "$managed/install/config-backups" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
[[ "$backup_count" -ge 1 ]] || fail "Reconfiguration did not create a configuration backup"
assert_not_contains "$managed/install/docker-compose.yml" "meilisearch:"
assert_not_contains "$managed/install/docker-compose.yml" "  chrome:"
assert_contains "$managed/install/app.env" 'CRAWLER_STORE_SCREENSHOT="false"'
assert_contains "$managed/install/app.env" 'DISABLE_SIGNUPS="true"'
assert_contains "$managed/install/workers.env" 'CRAWLER_HEADLESS_BROWSER="false"'
assert_contains "$managed/install/app.env" "$before_secret"
assert_contains "$managed/install/app.env" 'CUSTOM_OPERATOR_SETTING="preserve-this"'

# External services require their secret environment variables and do not leak them to stdout.
external="$root/external"
mkdir -p "$external/data"
printf 'existing\n' >"$external/data/marker"
external_output="$(KARAKEEP_MEILI_MASTER_KEY='meili-private' \
  KARAKEEP_BROWSERLESS_TOKEN='browser-private' \
  KARAKEEP_OPENAI_API_KEY='ai-private' \
  bash "$INSTALLER" --non-interactive --no-start --yes \
    --install-dir "$external/install" --data-dir "$external/data" \
    --public-url https://external.example.com --data-mode existing \
    --search external --meili-url https://meili.internal \
    --renderer external --renderer-url wss://browser.internal \
    --ai openai --disable-signups)"
assert_not_contains "$external_output" "meili-private"
assert_not_contains "$external_output" "browser-private"
assert_not_contains "$external_output" "ai-private"
assert_not_contains "$external/install/docker-compose.yml" "  meilisearch:"
assert_not_contains "$external/install/docker-compose.yml" "  chrome:"
assert_contains "$external/install/app.env" 'MEILI_ADDR="https://meili.internal"'
assert_contains "$external/install/workers.env" 'BROWSERLESS_URL="wss://browser.internal"'
assert_contains "$external/install/workers.env" 'BROWSER_CONNECT_ONDEMAND="true"'
assert_contains "$external/install/app.env" 'INFERENCE_ENABLE_AUTO_SUMMARIZATION="true"'
assert_contains "$external/install/app.env" 'OPENAI_API_KEY="ai-private"'
assert_not_contains "$external/install/workers.env" 'OPENAI_API_KEY='

# Installed helpers discover their own custom directory for management and reconfiguration.
: >"$FAKE_DOCKER_LOG"
"$external/install/install.sh" status >/dev/null
assert_contains "$FAKE_DOCKER_LOG" 'compose ps'
"$external/install/install.sh" --non-interactive --reconfigure --no-start --yes >/dev/null
assert_contains "$external/install/app.env" 'NEXTAUTH_URL="https://external.example.com"'
assert_contains "$external/install/app.env" 'OPENAI_API_KEY="ai-private"'
assert_contains "$external/install/workers.env" 'BROWSERLESS_TOKEN="browser-private"'
: >"$FAKE_DOCKER_LOG"
"$external/install/install.sh" --non-interactive --reconfigure --yes >/dev/null
assert_not_contains "$FAKE_DOCKER_LOG" 'compose pull'

# Reconfiguration preserves authentication/search secrets and image pins, including on v2 installs.
legacy="$root/v2"
bash "$INSTALLER" --non-interactive --no-start --yes \
  --install-dir "$legacy/install" --data-dir "$legacy/data" --port 45678 \
  --public-url https://legacy.example.com --data-mode fresh \
  --search managed --renderer managed --ai deferred >/dev/null
legacy_secret="$(sed -n '/^NEXTAUTH_SECRET=/p' "$legacy/install/app.env")"
legacy_meili="$(sed -n '/^MEILI_MASTER_KEY=/p' "$legacy/install/app.env")"
rm "$legacy/install/.installer-state"
sed -i 's/:web-stable/:web-v1.2.3/;s/:workers-stable/:workers-v1.2.3/' "$legacy/install/docker-compose.yml"
sed -i 's|image: ghcr.io/absolutepraya/marka:web-v1.2.3|image: "ghcr.io/absolutepraya/marka:web-v1.2.3" # pinned|' "$legacy/install/docker-compose.yml"
bash "$legacy/install/install.sh" --non-interactive --reconfigure --no-start --yes >/dev/null
assert_contains "$legacy/install/app.env" "$legacy_secret"
assert_contains "$legacy/install/app.env" "$legacy_meili"
assert_contains "$legacy/install/docker-compose.yml" '127.0.0.1:45678:3000'
assert_contains "$legacy/install/docker-compose.yml" ':web-v1.2.3'
assert_contains "$legacy/install/docker-compose.yml" ':workers-v1.2.3'
KARAKEEP_OPENAI_API_KEY='new-ai-key' bash "$legacy/install/install.sh" --non-interactive --reconfigure --ai openai --no-start --yes >/dev/null
assert_contains "$legacy/install/app.env" 'INFERENCE_ENABLE_AUTO_SUMMARIZATION="true"'
assert_contains "$legacy/install/app.env" 'OPENAI_API_KEY="new-ai-key"'
sed -i 's/127.0.0.1:45678:3000/127.0.0.2:45678:3000/' "$legacy/install/docker-compose.yml"
printf '\n%.0s' {1..20} | bash "$legacy/install/install.sh" --reconfigure --no-start --yes >/dev/null
assert_contains "$legacy/install/docker-compose.yml" '127.0.0.2:45678:3000'

# Env files and Compose remain authoritative if an operator edits them after setup.
printf 'OPENAI_API_KEY="manual-config-key"\n' >>"$managed/install/app.env"
sed -i 's/127.0.0.1:3000:3000/127.0.0.1:45321:3000/' "$managed/install/docker-compose.yml"
bash "$managed/install/install.sh" --non-interactive --reconfigure --no-start --yes >/dev/null
assert_contains "$managed/install/app.env" 'OPENAI_API_KEY="manual-config-key"'
assert_contains "$managed/install/docker-compose.yml" '127.0.0.1:45321:3000'
assert_contains "$managed/install/app.env" 'CUSTOM_OPERATOR_SETTING="preserve-this"'

# Dry-run checks the same data constraints as installation.
for mode in fresh existing; do
  dry_data="$external/data"
  [[ "$mode" != existing ]] || dry_data="$root/not-present"
  if bash "$INSTALLER" --non-interactive --dry-run --yes \
    --install-dir "$root/bad-dry" --data-dir "$dry_data" \
    --public-url https://dry.example.com --data-mode "$mode" \
    --search disabled --renderer disabled --ai disabled >"$root/bad-dry.out" 2>&1; then
    fail "Dry-run accepted invalid $mode data"
  fi
done

# Tilde expansion and dotenv decoding never execute operator input.
# shellcheck source=install.sh
source "$INSTALLER"
# shellcheck disable=SC2088 # Literal input from a prompt, not shell expansion.
[[ "$(expand_path '~/custom')" == "$HOME/custom" ]] || fail 'Tilde expansion failed'
special='literal-$not_expanded-quote"-slash\-tick`-'
special+='$(touch '"$root"'/not-executed)'
dotenv_line TEST_VALUE "$special" >"$root/roundtrip.env"
[[ "$(read_env_value "$root/roundtrip.env" TEST_VALUE)" == "$special" ]] || fail 'Literal env roundtrip failed'
[[ ! -e "$root/not-executed" ]] || fail 'Env input was executed as shell code'
assert_not_contains "$root/roundtrip.env" '\`'
printf '  export TEST_VALUE="retained-value" # operator note\n' >"$root/commented.env"
[[ "$(read_env_value "$root/commented.env" TEST_VALUE)" == retained-value ]] || fail 'Quoted env comment changed a value'
printf "TEST_VALUE='single-quoted' # operator note\n" >"$root/commented.env"
[[ "$(read_env_value "$root/commented.env" TEST_VALUE)" == single-quoted ]] || fail 'Single-quoted env comment changed a value'

# Missing external renderer token must fail before files are written.
missing="$root/missing"
if KARAKEEP_MEILI_MASTER_KEY='key' bash "$INSTALLER" --non-interactive --no-start --yes \
  --install-dir "$missing/install" --data-dir "$missing/data" \
  --public-url https://missing.example.com --data-mode fresh \
  --search managed --renderer external --renderer-url wss://browser.internal \
  --ai disabled >/dev/null 2>&1; then
  fail "External renderer without token unexpectedly succeeded"
fi
[[ ! -e "$missing/install" ]] || fail "Failed validation wrote installation files"

# Fresh installs cannot lock out the first account.
locked="$root/locked"
if bash "$INSTALLER" --non-interactive --dry-run --yes \
  --install-dir "$locked/install" --data-dir "$locked/data" \
  --public-url https://locked.example.com --data-mode fresh \
  --search disabled --renderer disabled --ai disabled --disable-signups >/dev/null 2>&1; then
  fail "Fresh install with disabled signups unexpectedly succeeded"
fi

# Backup uses the persisted data directory and never removes it.
backup_root="$root/backups"
bash "$external/install/install.sh" backup --install-dir "$external/install" --backup-dir "$backup_root" >/dev/null
archive="$(find "$backup_root" -maxdepth 1 -name 'marka-data-*.tar.gz' -print -quit)"
[[ -n "$archive" && -f "$archive" ]] || fail "Backup archive was not created"
[[ -f "$external/data/marker" ]] || fail "Backup removed persistent data"

# Backup recovery preserves exact running state, including when tar fails.
failing_bin="$root/failing-bin"
mkdir -p "$failing_bin"
printf '#!/usr/bin/env bash\nexit 2\n' >"$failing_bin/tar"
chmod +x "$failing_bin/tar"
: >"$FAKE_DOCKER_LOG"
if PATH="$failing_bin:$PATH" FAKE_RUNNING='web' bash "$external/install/install.sh" backup --backup-dir "$root/failed-archives" >"$root/failed-backup.out" 2>&1; then
  fail 'Broken tar unexpectedly succeeded'
fi
assert_contains "$FAKE_DOCKER_LOG" 'compose start web'
assert_not_contains "$FAKE_DOCKER_LOG" 'compose start web workers'
[[ -z "$(find "$root/failed-archives" -type f -print -quit)" ]] || fail 'Failed backup left a partial archive'
: >"$FAKE_DOCKER_LOG"
FAKE_RUNNING='web workers' bash "$external/install/install.sh" backup --backup-dir "$root/success-archives" >/dev/null
assert_contains "$FAKE_DOCKER_LOG" 'compose start web workers'
if FAKE_RUNNING=web FAKE_START_FAIL=1 bash "$external/install/install.sh" backup --backup-dir "$root/restart-failed-archives" >/dev/null 2>&1; then
  fail 'Failed restart unexpectedly returned success'
fi
[[ -n "$(find "$root/restart-failed-archives" -name '*.tar.gz' -print -quit)" ]] || fail 'Restart failure deleted a valid backup'
if bash "$external/install/install.sh" backup --backup-dir "$external/data/nested" >/dev/null 2>&1; then
  fail 'Backup accepted a destination inside the data directory'
fi

# Configuration validation failure cleans staging files and preserves the installed files.
before_hash="$(sha256sum "$external/install/app.env" | awk '{print $1}')"
if FAKE_CONFIG_FAIL=1 bash "$external/install/install.sh" --non-interactive --reconfigure --no-start --yes >/dev/null 2>&1; then
  fail 'Invalid compose configuration unexpectedly succeeded'
fi
[[ "$before_hash" == "$(sha256sum "$external/install/app.env" | awk '{print $1}')" ]] || fail 'Failed validation replaced installed config'
[[ -z "$(find "$external/install" -maxdepth 1 -name '.guided-install.*' -print -quit)" ]] || fail 'Failed validation left staged secrets'

# Startup must wait for health and must not report readiness after a failure.
: >"$FAKE_DOCKER_LOG"
bash "$external/install/install.sh" start --wait-timeout 30 >/dev/null
assert_contains "$FAKE_DOCKER_LOG" 'up -d --remove-orphans --wait --wait-timeout 30'
if FAKE_UP_FAIL=1 bash "$external/install/install.sh" start >"$root/start-failed.out" 2>&1; then
  fail 'Unhealthy startup unexpectedly succeeded'
fi
assert_not_contains "$root/start-failed.out" 'Marka web and workers are ready'
assert_contains "$root/start-failed.out" 'doctor'

# An unsuccessful backup must prevent applying an update.
: >"$FAKE_DOCKER_LOG"
if PATH="$failing_bin:$PATH" FAKE_RUNNING=web bash "$external/install/install.sh" update --backup-dir "$root/update-failed" >/dev/null 2>&1; then
  fail 'Update proceeded after a failed backup'
fi
assert_not_contains "$FAKE_DOCKER_LOG" 'compose up -d'
: >"$FAKE_DOCKER_LOG"
if FAKE_PULL_FAIL=1 bash "$external/install/install.sh" update --backup-dir "$root/download-failed" >/dev/null 2>&1; then
  fail 'Update proceeded after image downloads failed'
fi
[[ "$(grep -c '^compose pull' "$FAKE_DOCKER_LOG")" == 3 ]] || fail 'Image download retries are not bounded to three attempts'
assert_not_contains "$FAKE_DOCKER_LOG" 'compose stop'
assert_not_contains "$FAKE_DOCKER_LOG" 'compose up -d'

# Reject an occupied project, dangerous path aliases, invalid addresses, and ignored dry-run flags.
if FAKE_PROJECT_OWNER=/another/install bash "$INSTALLER" --non-interactive --dry-run \
  --install-dir "$root/namespace" --data-dir "$root/namespace/data" \
  --public-url https://example.com --data-mode fresh --search disabled --renderer disabled --ai disabled >/dev/null 2>&1; then
  fail 'Installer accepted another installation using the same Compose project'
fi
if (validate_path 'Install directory' /tmp/..) >/dev/null 2>&1; then fail 'Root alias accepted'; fi
if (validate_bind_address 999.1.2.3) >/dev/null 2>&1; then fail 'Invalid IPv4 octet accepted'; fi
if (validate_http_url 'Public URL' https://) >/dev/null 2>&1; then fail 'Missing URL hostname accepted'; fi
: >"$FAKE_DOCKER_LOG"
if bash "$external/install/install.sh" uninstall --dry-run >/dev/null 2>&1; then fail 'Management command ignored --dry-run'; fi
assert_not_contains "$FAKE_DOCKER_LOG" 'down --remove-orphans'
if (
  export INSTALL_DIR="$root/busy-port" PORT=3000 BIND_ADDRESS=127.0.0.1
  timeout() { return 0; }
  validate_project_and_port
) >/dev/null 2>&1; then fail 'Installer accepted an occupied port'; fi
(
  export INSTALL_DIR="$external/install" PORT=3000 BIND_ADDRESS=127.0.0.1
  export FAKE_PUBLISHED_PORT=127.0.0.1:3000
  timeout() { return 0; }
  validate_project_and_port
) || fail 'Installer rejected its own published port'

# Uninstall must only tear down containers/network, not configuration or data.
: >"$root/docker.log"
bash "$external/install/install.sh" uninstall --install-dir "$external/install" >/dev/null
assert_contains "$root/docker.log" "down --remove-orphans"
[[ -f "$external/install/docker-compose.yml" ]] || fail "Uninstall removed configuration"
[[ -f "$external/data/marker" ]] || fail "Uninstall removed persistent data"

printf 'Installer tests passed.\n'
