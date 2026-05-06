#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "Pulling latest changes..."
git pull

echo "Rebuilding and restarting container..."
docker compose up --build -d

echo "Done. Tailing logs (Ctrl+C to stop tailing)..."
docker compose logs -f
