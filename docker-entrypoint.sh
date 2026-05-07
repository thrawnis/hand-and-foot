#!/bin/sh
set -e

echo "==> Pulling latest code..."
if ! git pull --ff-only 2>&1; then
  echo "==> Warning: git pull failed — starting with existing code"
fi

# Build steps require devDependencies (tsc, vite) regardless of NODE_ENV.
# Use --include=dev to override the production environment variable.

echo "==> Installing client dependencies..."
npm install --prefix /app/client --include=dev --silent

echo "==> Building client..."
npm run build --prefix /app/client

echo "==> Installing server dependencies..."
npm install --prefix /app/server --include=dev --silent

echo "==> Building server..."
npm run build --prefix /app/server

echo "==> Starting server..."
exec node /app/server/dist/index.js
