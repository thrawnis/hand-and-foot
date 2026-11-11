#!/usr/bin/env bash
set -e

# The whole script lives in main() so bash parses it fully before running.
# `git reset --hard` below can rewrite this very file, and bash otherwise
# reads scripts incrementally, which would execute a mix of old and new lines.
main() {
  BRANCH="main"
  IMAGE_NAME="hand-and-foot-app"
  BUILD_CONTEXT="."

  # --pull-base-images: opt-in re-check of FROM-image digests against the
  # registry. Off by default so a normal rebuild never pays for a registry
  # round-trip it doesn't need.
  PULL_BASE_IMAGES=0
  FORCE=0
  for arg in "$@"; do
    case "$arg" in
      --pull-base-images) PULL_BASE_IMAGES=1 ;;
      --force) FORCE=1 ;;
      *) echo "Unknown argument: $arg" >&2; exit 1 ;;
    esac
  done

  cd "$(dirname "$0")"

  # Discard any local edits and untracked files so the checkout exactly matches
  # origin. Ignored files (.env, data/, volumes/) are left alone.
  echo "==> Discarding local changes and pulling latest $BRANCH..."
  SCRIPT_HASH_BEFORE="$(git hash-object rebuild.sh)"
  git fetch origin "$BRANCH"
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  git clean -fd
  TARGET_SHA="$(git rev-parse HEAD)"

  # If the pull brought in a new version of this script, run that instead.
  if [ -z "$REBUILD_REEXECED" ] && [ "$(git hash-object rebuild.sh)" != "$SCRIPT_HASH_BEFORE" ]; then
    echo "==> rebuild.sh was updated — re-running the new version..."
    REBUILD_REEXECED=1 exec bash ./rebuild.sh "$@"
  fi

  # Don't just trust that the host checkout is up to date: check what the
  # running container was actually built from (stamped into the image as a
  # label below). A previous run that pulled the latest code but then failed
  # to build or deploy would otherwise be mistaken for "already up to date".
  RUNNING_CONTAINER="$(docker compose ps -q app 2>/dev/null || true)"
  RUNNING_SHA=""
  if [ -n "$RUNNING_CONTAINER" ]; then
    RUNNING_SHA="$(docker inspect --format '{{ index .Config.Labels "git.sha" }}' "$RUNNING_CONTAINER" 2>/dev/null || true)"
  fi

  if [ "$RUNNING_SHA" = "$TARGET_SHA" ] && [ "$FORCE" -ne 1 ]; then
    echo "==> Running container is already up to date ($TARGET_SHA) — nothing to do. Use --force to rebuild anyway."
    exit 0
  fi

  if [ -n "$RUNNING_SHA" ] && [ "$RUNNING_SHA" != "$TARGET_SHA" ]; then
    echo "==> Running container is on $RUNNING_SHA, target is $TARGET_SHA — rebuilding."
  fi

  # Build directly with `docker buildx build` rather than `docker compose build`.
  # Compose's own build step relies on it correctly detecting the buildx plugin;
  # on this server that detection is unreliable and it can silently fall back to
  # the legacy (non-BuildKit) builder, which chokes on any BuildKit-only
  # Dockerfile syntax (# syntax=..., RUN --mount=type=cache, etc.). Calling
  # buildx ourselves sidesteps that detection entirely.
  echo "==> Building image with buildx..."
  BUILDX_ARGS=(--tag "${IMAGE_NAME}:latest" --label "git.sha=${TARGET_SHA}" --load)
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

  echo "==> Deployed: ${TARGET_SHA:0:7} — $(git log -1 --format='%s')"
  echo "==> Done. Tailing logs for 15 seconds (Ctrl+C to stop early)..."
  timeout 15 docker compose logs -f || true
}

main "$@"
exit
