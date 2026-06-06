#!/bin/sh
set -e

BRANCH="dev"

echo "==> Pulling latest code from $BRANCH..."
git fetch origin "$BRANCH" 2>&1 || true
git checkout "$BRANCH" 2>&1 || true
if ! git merge --ff-only "origin/$BRANCH" 2>&1; then
  echo "==> Warning: git pull failed — starting with existing code"
fi

# NODE_ENV=production (from docker-compose) tells npm to skip devDependencies.
# Override it per-command for install/build steps so tsc and vite are available.

echo "==> Installing client dependencies..."
cd /app/client
NODE_ENV=development npm install --silent

echo "==> Building client..."
npm run build

echo "==> Installing server dependencies..."
cd /app/server
NODE_ENV=development npm install --silent

echo "==> Building server..."
npm run build

echo "==> Starting server..."
exec node /app/server/dist/index.js
