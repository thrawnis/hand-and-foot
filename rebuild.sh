#!/usr/bin/env bash
set -e

BRANCH="claude/hand-foot-card-game-VF8Fb"

cd "$(dirname "$0")"

echo "==> Switching to $BRANCH and pulling latest code..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"

# Rebuild the image if the Dockerfile or compose file changed.
echo "==> Building image..."
docker compose build

# Force-recreate ensures the container restarts and runs the entrypoint
# even if the image layer cache was unchanged.
echo "==> Restarting container (entrypoint will install deps + build inside)..."
docker compose up -d --force-recreate

echo "==> Deployed: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
echo "==> Done. Tailing logs for 10 seconds (Ctrl+C to stop early)..."
timeout 10 docker compose logs -f || true
