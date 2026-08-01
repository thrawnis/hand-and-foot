#!/usr/bin/env bash
set -e

BRANCH="dev"
IMAGE_NAME="hand-and-foot-app"
BUILD_CONTEXT="."

# --pull-base-images: opt-in re-check of FROM-image digests against the
# registry. Off by default so a normal rebuild never pays for a registry
# round-trip it doesn't need.
PULL_BASE_IMAGES=0
for arg in "$@"; do
  case "$arg" in
    --pull-base-images) PULL_BASE_IMAGES=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"

echo "==> Switching to $BRANCH and pulling latest code..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"

# Build directly with `docker buildx build` rather than `docker compose build`.
# Compose's own build step relies on it correctly detecting the buildx plugin;
# on this server that detection is unreliable and it can silently fall back to
# the legacy (non-BuildKit) builder, which chokes on any BuildKit-only
# Dockerfile syntax (# syntax=..., RUN --mount=type=cache, etc.). Calling
# buildx ourselves sidesteps that detection entirely.
echo "==> Building image with buildx..."
BUILDX_ARGS=(--tag "${IMAGE_NAME}:latest" --load)
if [ "$PULL_BASE_IMAGES" -eq 1 ]; then
  echo "==> --pull-base-images set: re-checking base image digests against the registry"
  BUILDX_ARGS+=(--pull)
fi
docker buildx build "${BUILDX_ARGS[@]}" "$BUILD_CONTEXT"

# --no-build tells Compose to use the image we just built above (pinned via
# `image:` in docker-compose.yml) instead of attempting its own build.
# Force-recreate ensures the container restarts and runs the entrypoint
# even if the image layer cache was unchanged.
echo "==> Restarting container (entrypoint will install deps + build inside)..."
docker compose up -d --no-build --force-recreate app

echo "==> Deployed: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
echo "==> Done. Tailing logs for 15 seconds (Ctrl+C to stop early)..."
timeout 15 docker compose logs -f || true
