#!/usr/bin/env bash
# Build native Vast installers for the *current* OS/arch via Tauri 2.
#
# Usage:
#   ./scripts/desktop-build.sh              # release bundles for this platform
#   ./scripts/desktop-build.sh --debug      # debug build
#   ./scripts/desktop-build.sh --bundles dmg,app   # macOS-only targets (example)
#
# Output (typical):
#   apps/desktop/src-tauri/target/release/bundle/
#     macos/   .app / .dmg
#     msi/     .msi
#     nsis/    .exe installer
#     deb/     .deb
#     appimage/.AppImage
#     rpm/     .rpm
#
# Important: Tauri does NOT cross-compile installers well. Build on each OS
# (or use GitHub Actions matrix — see .github/workflows/desktop.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEBUG=0
EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG=1; shift ;;
    --bundles)
      EXTRA+=(--bundles "$2")
      shift 2
      ;;
    *)
      EXTRA+=("$1")
      shift
      ;;
  esac
done

command -v rustc >/dev/null || {
  echo "Rust is required. Install from https://rustup.rs"
  exit 1
}
command -v pnpm >/dev/null || {
  echo "pnpm is required"
  exit 1
}

echo "==> Platform: $(uname -s) $(uname -m)"
echo "==> Rust:     $(rustc --version)"

# macOS: ensure CLT / Xcode present (common failure mode)
if [[ "$(uname -s)" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    echo "Xcode Command Line Tools required. Run: xcode-select --install"
    exit 1
  fi
  # Default to app+dmg when no --bundles passed on macOS
  if [[ ${#EXTRA[@]} -eq 0 ]]; then
    EXTRA=(--bundles app,dmg)
    echo "==> macOS default bundles: app,dmg"
  fi
fi

"$ROOT/scripts/desktop-prepare.sh"

echo "==> Installing desktop deps (Tauri CLI)"
pnpm --filter @vast/desktop install

echo "==> Package sidecar + tauri build"
if [[ "$DEBUG" -eq 1 ]]; then
  pnpm --filter @vast/desktop run build:debug -- "${EXTRA[@]+"${EXTRA[@]}"}"
  BUNDLE_ROOT="$ROOT/apps/desktop/src-tauri/target/debug/bundle"
else
  # package.json "build" already packages sidecar then runs tauri build
  pnpm --filter @vast/desktop run build -- "${EXTRA[@]+"${EXTRA[@]}"}"
  BUNDLE_ROOT="$ROOT/apps/desktop/src-tauri/target/release/bundle"
fi

echo ""
echo "==> Done. Bundles (if any):"
if [[ -d "$BUNDLE_ROOT" ]]; then
  # .app is a directory on macOS; include both files and app bundles
  find "$BUNDLE_ROOT" \( \
    -type f \( \
      -name '*.dmg' -o -name '*.msi' -o -name '*.exe' \
      -o -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' \
    \) \
    -o -type d -name '*.app' \
  \) 2>/dev/null | sed 's/^/  /' || true
  echo "  Directory: $BUNDLE_ROOT"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    APP="$(find "$BUNDLE_ROOT" -type d -name 'Vast.app' 2>/dev/null | head -1 || true)"
    if [[ -n "${APP:-}" ]]; then
      echo ""
      echo "  macOS smoke: open \"$APP\""
      echo "  Note: API sidecar may still need pnpm dev:server until fully packaged."
    fi
  fi
else
  echo "  (no bundle dir yet — check tauri build output above)"
fi
