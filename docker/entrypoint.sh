#!/bin/sh
set -e

export VAST_DATA_DIR="${VAST_DATA_DIR:-/data}"
export VAST_WEB_DIST="${VAST_WEB_DIST:-/app/web-dist}"
export PORT="${PORT:-8080}"
export VAST_BIND="${VAST_BIND:-0.0.0.0}"
export VAST_RUNTIME="${VAST_RUNTIME:-web}"

mkdir -p "$VAST_DATA_DIR"

# pnpm deploy puts the server package at /app with dist/ and node_modules/
if [ -f /app/dist/index.js ]; then
  exec node /app/dist/index.js
fi

# Fallback monorepo layout
if [ -f /app/apps/server/dist/index.js ]; then
  cd /app/apps/server
  exec node dist/index.js
fi

echo "Could not find Vast server entrypoint" >&2
exit 1
