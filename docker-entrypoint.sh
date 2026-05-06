#!/bin/sh
set -e

echo "==> Pulling latest code..."
if ! git pull --ff-only 2>&1; then
  echo "==> Warning: git pull failed — starting with existing code"
fi

echo "==> Installing client dependencies..."
npm install --prefix /app/client --silent

echo "==> Building client..."
npm run build --prefix /app/client

echo "==> Installing server dependencies..."
npm install --prefix /app/server --silent

echo "==> Building server..."
npm run build --prefix /app/server

echo "==> Starting server..."
exec node /app/server/dist/index.js
