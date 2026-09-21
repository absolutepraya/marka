#!/usr/bin/env bash
set -Eeuo pipefail

: "${IMAGE_NAME:?IMAGE_NAME is required}"
: "${VERSION:?VERSION is required}"
: "${WEB_DIGEST:?WEB_DIGEST is required}"
: "${WORKERS_DIGEST:?WORKERS_DIGEST is required}"

get_digest() {
  docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null | head -n 1
}

web_stable="$IMAGE_NAME:web-stable"
workers_stable="$IMAGE_NAME:workers-stable"
previous_web="$(get_digest "$web_stable" || true)"
previous_workers="$(get_digest "$workers_stable" || true)"

manual_recovery() {
  echo "Manual stable-channel recovery is required." >&2
  if [[ -n "$previous_web" && -n "$previous_workers" ]]; then
    echo "Restore the previous stable pair with:" >&2
    printf '  docker buildx imagetools create --tag %s %s\n' \
      "$web_stable" "$IMAGE_NAME@$previous_web" >&2
    printf '  docker buildx imagetools create --tag %s %s\n' \
      "$workers_stable" "$IMAGE_NAME@$previous_workers" >&2
  else
    echo "No complete previous stable pair was available. Complete the intended release with:" >&2
    printf '  docker buildx imagetools create --tag %s %s\n' \
      "$web_stable" "$IMAGE_NAME:web-v$VERSION" >&2
    printf '  docker buildx imagetools create --tag %s %s\n' \
      "$workers_stable" "$IMAGE_NAME:workers-v$VERSION" >&2
  fi
}

if [[ -n "$previous_web" && -z "$previous_workers" && "$previous_web" != "$WEB_DIGEST" ]]; then
  echo "Stable channel has only web-stable, and it does not match the intended release." >&2
  manual_recovery
  exit 1
fi
if [[ -z "$previous_web" && -n "$previous_workers" && "$previous_workers" != "$WORKERS_DIGEST" ]]; then
  echo "Stable channel has only workers-stable, and it does not match the intended release." >&2
  manual_recovery
  exit 1
fi

verify_pair() {
  local expected_web="$1" expected_workers="$2" actual_web actual_workers
  actual_web="$(get_digest "$web_stable" || true)"
  actual_workers="$(get_digest "$workers_stable" || true)"
  if [[ "$actual_web" == "$expected_web" && "$actual_workers" == "$expected_workers" ]]; then
    return 0
  fi
  echo "Stable pair mismatch: web=$actual_web workers=$actual_workers; expected web=$expected_web workers=$expected_workers." >&2
  return 1
}

restore_previous_pair() {
  local failed=0
  if ! docker buildx imagetools create --tag "$web_stable" "$IMAGE_NAME@$previous_web"; then
    echo "Failed to restore $web_stable." >&2
    failed=1
  fi
  if ! docker buildx imagetools create --tag "$workers_stable" "$IMAGE_NAME@$previous_workers"; then
    echo "Failed to restore $workers_stable." >&2
    failed=1
  fi
  if ! verify_pair "$previous_web" "$previous_workers"; then
    failed=1
  fi
  if ((failed)); then
    manual_recovery
    return 1
  fi
  echo "Restored the previous stable image pair."
}

rollback() {
  if [[ -n "$previous_web" && -n "$previous_workers" ]]; then
    restore_previous_pair
    return
  fi
  echo "No complete previous stable pair existed. The current release may be partially promoted." >&2
  manual_recovery
  return 1
}

promote_ref() {
  local target="$1" source="$2" expected="$3" current
  current="$(get_digest "$target" || true)"
  if [[ "$current" == "$expected" ]]; then
    echo "$target already points to the intended digest."
    return 0
  fi
  docker buildx imagetools create --tag "$target" "$source"
}

if verify_pair "$WEB_DIGEST" "$WORKERS_DIGEST"; then
  echo "Stable channel already points to $VERSION."
  exit 0
fi

if ! promote_ref "$web_stable" "$IMAGE_NAME:web-v$VERSION" "$WEB_DIGEST"; then
  rollback
  exit 1
fi
if ! promote_ref "$workers_stable" "$IMAGE_NAME:workers-v$VERSION" "$WORKERS_DIGEST"; then
  rollback
  exit 1
fi
if ! verify_pair "$WEB_DIGEST" "$WORKERS_DIGEST"; then
  echo "Stable channel verification failed." >&2
  rollback
  exit 1
fi
