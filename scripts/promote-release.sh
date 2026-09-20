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

if [[ -n "$previous_web" && -z "$previous_workers" ]] || [[ -z "$previous_web" && -n "$previous_workers" ]]; then
  echo "Stable channel is not paired. Refusing promotion." >&2
  exit 1
fi

rollback() {
  if [[ -n "$previous_web" && -n "$previous_workers" ]]; then
    docker buildx imagetools create --tag "$web_stable" "$IMAGE_NAME@$previous_web"
    docker buildx imagetools create --tag "$workers_stable" "$IMAGE_NAME@$previous_workers"
    echo "Restored the previous stable image pair."
  else
    echo "No previous stable pair existed. Manual cleanup is required if first-release promotion was partial." >&2
  fi
}

if [[ "$(get_digest "$web_stable")" == "$WEB_DIGEST" && "$(get_digest "$workers_stable")" == "$WORKERS_DIGEST" ]]; then
  echo "Stable channel already points to $VERSION."
  exit 0
fi

if ! docker buildx imagetools create --tag "$web_stable" "$IMAGE_NAME:web-v$VERSION"; then
  rollback
  exit 1
fi
if ! docker buildx imagetools create --tag "$workers_stable" "$IMAGE_NAME:workers-v$VERSION"; then
  rollback
  exit 1
fi
if [[ "$(get_digest "$web_stable")" != "$WEB_DIGEST" || "$(get_digest "$workers_stable")" != "$WORKERS_DIGEST" ]]; then
  echo "Stable channel verification failed." >&2
  rollback
  exit 1
fi
