#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMOTER="$SCRIPT_DIR/promote-release.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_state() {
  local state="$1" ref="$2" expected="$3" actual
  actual="$(grep -F "${ref}=" "$state" | cut -d= -f2- || true)"
  [[ "$actual" == "$expected" ]] || fail "$ref expected $expected, got $actual"
}

make_fake_docker() {
  local dir="$1"
  mkdir -p "$dir"
  cat >"$dir/docker" <<'EOF_DOCKER'
#!/usr/bin/env bash
set -euo pipefail

state_value() {
  grep -F "${1}=" "$FAKE_RELEASE_STATE" | cut -d= -f2- || true
}

set_state_value() {
  local ref="$1" value="$2" temp
  temp="${FAKE_RELEASE_STATE}.tmp"
  grep -Fv "${ref}=" "$FAKE_RELEASE_STATE" >"$temp" || true
  printf '%s=%s\n' "$ref" "$value" >>"$temp"
  mv "$temp" "$FAKE_RELEASE_STATE"
}

if [[ "$1" == "buildx" && "$2" == "imagetools" && "$3" == "inspect" ]]; then
  value="$(state_value "$4")"
  [[ -n "$value" ]] || exit 1
  printf '%s\n' "$value"
  exit 0
fi

if [[ "$1" == "buildx" && "$2" == "imagetools" && "$3" == "create" ]]; then
  if [[ -n "${FAKE_RELEASE_LOG:-}" ]]; then
    printf '%s\n' "$*" >>"$FAKE_RELEASE_LOG"
  fi
  target="$5"
  source="$6"
  if [[ "${FAKE_RELEASE_FAIL_WORKERS:-0}" == "1" && "$target" == *workers-stable ]]; then
    exit 1
  fi
  if [[ "$source" == *@* ]]; then
    value="${source##*@}"
  else
    value="$(state_value "$source")"
  fi
  [[ -n "$value" ]] || exit 1
  set_state_value "$target" "$value"
  exit 0
fi

exit 1
EOF_DOCKER
  chmod +x "$dir/docker"
}

bash -n "$PROMOTER"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT
fake_bin="$root/bin"
make_fake_docker "$fake_bin"
state="$root/state"
cat >"$state" <<'EOF_STATE'
ghcr.io/absolutepraya/marka:web-stable=sha256:web-old
ghcr.io/absolutepraya/marka:workers-stable=sha256:workers-old
ghcr.io/absolutepraya/marka:web-v0.1.0=sha256:web-new
ghcr.io/absolutepraya/marka:workers-v0.1.0=sha256:workers-new
EOF_STATE

PATH="$fake_bin:$PATH" \
FAKE_RELEASE_STATE="$state" \
IMAGE_NAME="ghcr.io/absolutepraya/marka" \
VERSION="0.1.0" \
WEB_DIGEST="sha256:web-new" \
WORKERS_DIGEST="sha256:workers-new" \
bash "$PROMOTER"
assert_state "$state" "ghcr.io/absolutepraya/marka:web-stable" "sha256:web-new"
assert_state "$state" "ghcr.io/absolutepraya/marka:workers-stable" "sha256:workers-new"

cat >"$state" <<'EOF_STATE'
ghcr.io/absolutepraya/marka:web-stable=sha256:web-new
ghcr.io/absolutepraya/marka:web-v0.1.0=sha256:web-new
ghcr.io/absolutepraya/marka:workers-v0.1.0=sha256:workers-new
EOF_STATE
PATH="$fake_bin:$PATH" \
FAKE_RELEASE_STATE="$state" \
IMAGE_NAME="ghcr.io/absolutepraya/marka" \
VERSION="0.1.0" \
WEB_DIGEST="sha256:web-new" \
WORKERS_DIGEST="sha256:workers-new" \
bash "$PROMOTER"
assert_state "$state" "ghcr.io/absolutepraya/marka:web-stable" "sha256:web-new"
assert_state "$state" "ghcr.io/absolutepraya/marka:workers-stable" "sha256:workers-new"

cat >"$state" <<'EOF_STATE'
ghcr.io/absolutepraya/marka:web-stable=sha256:web-old
ghcr.io/absolutepraya/marka:workers-stable=sha256:workers-old
ghcr.io/absolutepraya/marka:web-v0.1.0=sha256:web-new
ghcr.io/absolutepraya/marka:workers-v0.1.0=sha256:workers-new
EOF_STATE
if PATH="$fake_bin:$PATH" \
  FAKE_RELEASE_STATE="$state" \
  FAKE_RELEASE_FAIL_WORKERS="1" \
  IMAGE_NAME="ghcr.io/absolutepraya/marka" \
  VERSION="0.1.0" \
  WEB_DIGEST="sha256:web-new" \
  WORKERS_DIGEST="sha256:workers-new" \
  bash "$PROMOTER" >/dev/null 2>&1; then
  fail "promotion unexpectedly succeeded when workers promotion failed"
fi
assert_state "$state" "ghcr.io/absolutepraya/marka:web-stable" "sha256:web-old"
assert_state "$state" "ghcr.io/absolutepraya/marka:workers-stable" "sha256:workers-old"

failure_log="$root/failure.log"
: >"$failure_log"
if failure_output="$(PATH="$fake_bin:$PATH" \
  FAKE_RELEASE_STATE="$state" \
  FAKE_RELEASE_LOG="$failure_log" \
  FAKE_RELEASE_FAIL_WORKERS="1" \
  IMAGE_NAME="ghcr.io/absolutepraya/marka" \
  VERSION="0.1.0" \
  WEB_DIGEST="sha256:web-new" \
  WORKERS_DIGEST="sha256:workers-new" \
  bash "$PROMOTER" 2>&1)"; then
  fail "promotion unexpectedly succeeded when rollback restoration failed"
fi
grep -Fq "Manual stable-channel recovery is required." <<<"$failure_output" ||
  fail "rollback failure did not print manual recovery instructions"
[[ "$(grep -Fc 'ghcr.io/absolutepraya/marka:web-stable' "$failure_log")" -ge 2 ]] ||
  fail "web rollback was not attempted after worker promotion failure"
[[ "$(grep -Fc 'ghcr.io/absolutepraya/marka:workers-stable' "$failure_log")" -ge 2 ]] ||
  fail "worker rollback was not attempted after worker promotion failure"

printf 'Release promotion tests passed.\n'
