#!/usr/bin/env bash
# Run Tauri desktop in dev mode.
# Packages the sidecar so the app is self-contained even in dev
# (window navigates to the local API that serves the SPA).
# Optional: set VAST_DESKTOP_USE_VITE=1 to keep Vite HMR (needs pnpm dev:server).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm --filter @vast/shared build
pnpm --filter @vast/mongo-core build
pnpm --filter @vast/desktop install

if [[ "${VAST_DESKTOP_USE_VITE:-}" == "1" ]]; then
  echo "Vite HMR mode — start API with: pnpm dev:server"
else
  echo "Packaging sidecar for standalone desktop dev…"
  bash "$ROOT/scripts/desktop-package-sidecar.sh"
fi

echo "Starting Tauri…"
pnpm --filter @vast/desktop exec tauri dev
