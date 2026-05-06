#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# First-time or Dockerfile-changed: rebuild the image (fast — just apk + git)
echo "Building image..."
docker compose build

# Start (or restart) the container.
# The entrypoint inside the container will automatically:
#   1. git pull  --  fetch the latest committed code
#   2. npm install + build client
#   3. npm install + build server
#   4. start the server
echo "Starting container (auto-pull + rebuild will run inside)..."
docker compose up -d

echo "Done. Tailing logs (Ctrl+C to stop tailing)..."
docker compose logs -f
