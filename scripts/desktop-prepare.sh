#!/usr/bin/env bash
# Build web + server packages that the desktop shell depends on.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building shared packages"
pnpm --filter @vast/shared build
pnpm --filter @vast/mongo-core build

echo "==> Building web (SPA for Tauri frontendDist)"
pnpm --filter @vast/web build

echo "==> Building server (Node API — run alongside desktop in dev, or package as sidecar later)"
pnpm --filter @vast/server build

echo "Prepare complete."
echo "  Web dist:    apps/web/dist"
echo "  Server dist: apps/server/dist"
