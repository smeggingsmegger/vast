#!/usr/bin/env bash
# Invoked by tauri beforeBuildCommand (cwd = this directory).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
export CI=true
exec bash "$ROOT/scripts/desktop-package-sidecar.sh"
