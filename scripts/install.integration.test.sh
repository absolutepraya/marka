#!/usr/bin/env bash
set -Eeuo pipefail

# Real Docker tests for the guided installer. Run only on a disposable Linux amd64 host.
# The production project name is deliberately exercised, so refuse an existing deployment.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "$(docker ps -aq --filter label=com.docker.compose.project=karakeep)" ]]; then
  printf 'Refusing integration test: a karakeep Compose deployment already exists.\n' >&2
  exit 1
fi
root="$(mktemp -d "${TMPDIR:-/tmp}/marka-installer-integration-XXXXXX")"
install_dir="$root/install"
probe_project="marka-installer-env-$(basename "$root" | tr '[:upper:]' '[:lower:]')"
owned=0
cleanup() {
  local result=$?
  trap - EXIT
  if ((owned)); then
    docker compose --project-directory "$install_dir" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ -f "$root/encoding/docker-compose.yml" ]]; then
    docker compose -p "$probe_project" --project-directory "$root/encoding" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  # Container-written files may be owned by root on the host.
  if [[ -d "$root" ]]; then
    docker run --rm -v "$root:/test-output" --entrypoint sh nginx:alpine -c 'rm -rf /test-output/* /test-output/.[!.]*' >/dev/null 2>&1 || true
    rm -rf "$root"
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The host does not need Node for installation. It is a test-client dependency only.
command -v node >/dev/null
port="${MARKA_INSTALLER_TEST_PORT:-43127}"
url="http://localhost:$port"
bash "$SCRIPT_DIR/install.sh" --non-interactive --no-start --yes \
  --install-dir "$install_dir" --data-dir "$install_dir/data" \
  --public-url "$url" --access local --port "$port" --data-mode fresh \
  --search managed --renderer managed --ai deferred
owned=1

# Probe literal credentials through the real Compose env parser without calling any AI API.
special='synthetic-$literal-quote"-slash\-tick`'
KARAKEEP_OPENAI_API_KEY="$special" bash "$SCRIPT_DIR/install.sh" --non-interactive --no-start --yes \
  --install-dir "$root/encoding" --data-dir "$root/encoding/data" \
  --public-url "$url" --access local --data-mode fresh \
  --search disabled --renderer disabled --ai openai >/dev/null
docker compose --project-directory "$install_dir" pull
export INSTALLER_EXPECTED_KEY="$special"
for service in web workers; do
  docker compose -p "$probe_project" --project-directory "$root/encoding" run --rm --no-deps -T \
    -e INSTALLER_EXPECTED_KEY --entrypoint node "$service" -e '
      const assert = require("node:assert/strict");
      assert.equal(process.env.OPENAI_API_KEY, process.env.INSTALLER_EXPECTED_KEY);
      assert.equal(process.env.INFERENCE_ENABLE_AUTO_TAGGING, "true");
      assert.equal(process.env.INFERENCE_ENABLE_AUTO_SUMMARIZATION, "true");
      console.log("PASS: literal shared AI configuration");
    '
done
unset INSTALLER_EXPECTED_KEY

mkdir -p "$root/html"
cat >"$root/html/proof.html" <<'HTML'
<!doctype html><html><head><title>Static shell</title></head><body>
<h1 id="proof">JavaScript has not run</h1><script>
document.title = "markainstallersmokeproof";
document.querySelector("#proof").textContent = "Browser executed successfully";
</script></body></html>
HTML
cat >"$install_dir/docker-compose.override.yml" <<EOF_COMPOSE
services:
  installer-fixture:
    image: nginx:alpine
    volumes:
      - '$root/html:/usr/share/nginx/html:ro'
EOF_COMPOSE
printf 'CRAWLER_ALLOWED_INTERNAL_HOSTNAMES="installer-fixture"\n' >>"$install_dir/workers.env"
docker compose --project-directory "$install_dir" pull installer-fixture
"$install_dir/install.sh" start --wait-timeout 300
"$install_dir/install.sh" doctor
node "$SCRIPT_DIR/install-smoke.mjs" seed "$url" "$root/proof.json"

# Close signups through the supported reconfiguration flow, preserving the API key/session secret.
"$install_dir/install.sh" --non-interactive --reconfigure --disable-signups --yes --wait-timeout 300
node "$SCRIPT_DIR/install-smoke.mjs" verify "$url" "$root/proof.json"
"$install_dir/install.sh" backup --backup-dir "$root/backups"
archive="$(find "$root/backups" -name 'marka-data-*.tar.gz' -print -quit)"
[[ -n "$archive" ]]
node "$SCRIPT_DIR/install-smoke.mjs" after-backup "$url" "$root/proof.json"
"$install_dir/install.sh" stop
"$install_dir/install.sh" start --wait-timeout 300
node "$SCRIPT_DIR/install-smoke.mjs" verify "$url" "$root/proof.json"

# Exercise the documented restore procedure in an empty data directory.
"$install_dir/install.sh" stop
mv "$install_dir/data" "$root/data-before-restore"
tar --no-same-owner -xzf "$archive" -C "$install_dir"
"$install_dir/install.sh" start --wait-timeout 300
node "$SCRIPT_DIR/install-smoke.mjs" restored "$url" "$root/proof.json"
"$install_dir/install.sh" update --backup-dir "$root/update-backups" --wait-timeout 300
"$install_dir/install.sh" doctor
node "$SCRIPT_DIR/install-smoke.mjs" verify "$url" "$root/proof.json"
"$install_dir/install.sh" uninstall
[[ -f "$install_dir/data/db.db" && -f "$install_dir/app.env" ]]
printf 'Installer real-Docker integration tests passed.\n'
