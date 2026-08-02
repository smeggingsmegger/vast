#!/usr/bin/env bash
# Build native Vast installers for the *current* OS/arch via Tauri 2.
#
# Usage:
#   ./scripts/desktop-build.sh              # release bundles for this platform
#   ./scripts/desktop-build.sh --debug      # debug build
#   ./scripts/desktop-build.sh --no-dmg     # macOS: skip DMG (app only)
#   ./scripts/desktop-build.sh --bundles deb  # Linux/Windows: pass to tauri
#
# Output (typical):
#   apps/desktop/src-tauri/target/release/bundle/
#     macos/   Vast.app
#     dmg/     Vast_*.dmg          (macOS; via hdiutil — not Tauri create-dmg)
#     msi/ nsis/ deb/ appimage/ …
#
# Important: Tauri does NOT cross-compile installers well. Build on each OS
# (or use GitHub Actions matrix — see .github/workflows/desktop.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEBUG=0
WANT_DMG=1
EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) DEBUG=1; shift ;;
    --no-dmg) WANT_DMG=0; shift ;;
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

OS="$(uname -s)"
echo "==> Platform: $OS $(uname -m)"
echo "==> Rust:     $(rustc --version)"

clean_dmg_leftovers() {
  echo "==> Cleaning leftover DMG mounts (if any)"
  for m in /Volumes/dmg.*; do
    [[ -e "$m" ]] || continue
    echo "    detach $m"
    hdiutil detach "$m" -force >/dev/null 2>&1 || true
  done
  local img="" dev=""
  while IFS= read -r line; do
    case "$line" in
      image-path*)
        img="${line#image-path*:}"
        img="$(echo "$img" | sed 's/^[[:space:]]*//')"
        ;;
      /dev/disk*)
        dev="${line%%[[:space:]]*}"
        if [[ -n "${img:-}" && "$img" == *"/apps/desktop/src-tauri/target/"* ]]; then
          echo "    detach $dev"
          hdiutil detach "$dev" -force >/dev/null 2>&1 || true
        fi
        ;;
    esac
  done < <(hdiutil info 2>/dev/null || true)
  find "$ROOT/apps/desktop/src-tauri/target" -name 'rw.*.dmg' -delete 2>/dev/null || true
}

# Build a simple UDZO DMG from Vast.app without Tauri's create-dmg/AppleScript
# (create-dmg is flaky when other hdiutil images are attached).
make_macos_dmg() {
  local app="$1"
  local out_dir="$2"
  local version
  version="$(node -p "require('$ROOT/apps/desktop/package.json').version" 2>/dev/null || echo '0.1.0')"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    arm64) arch="aarch64" ;;
    x86_64) arch="x64" ;;
  esac
  local dmg_name="Vast_${version}_${arch}.dmg"
  local staging
  staging="$(mktemp -d "${TMPDIR:-/tmp}/vast-dmg.XXXXXX")"
  local out="$out_dir/$dmg_name"
  local tmp_dmg="$out_dir/.tmp-vast.dmg"

  mkdir -p "$out_dir"
  rm -f "$out" "$tmp_dmg"
  clean_dmg_leftovers

  echo "==> Creating DMG with hdiutil → $out"
  # Stage: app + Applications symlink (standard drag-to-install layout)
  cp -R "$app" "$staging/Vast.app"
  ln -s /Applications "$staging/Applications"

  # Create compressed DMG directly from the folder (no AppleScript, no rw mount dance)
  hdiutil create \
    -volname "Vast" \
    -srcfolder "$staging" \
    -ov \
    -format UDZO \
    -imagekey zlib-level=9 \
    "$out"

  rm -rf "$staging"
  if [[ -f "$out" ]]; then
    echo "    DMG ok ($(du -h "$out" | awk '{print $1}'))"
  else
    echo "    ERROR: DMG was not created" >&2
    return 1
  fi
}

if [[ "$OS" == "Darwin" ]]; then
  if ! xcode-select -p >/dev/null 2>&1; then
    echo "Xcode Command Line Tools required. Run: xcode-select --install"
    exit 1
  fi
  clean_dmg_leftovers
  # Always use Tauri for .app only; we build the DMG ourselves (more reliable).
  if [[ ${#EXTRA[@]} -eq 0 ]]; then
    EXTRA=(--bundles app)
    echo "==> macOS: Tauri builds app; DMG via hdiutil${WANT_DMG:+ (enabled)}"
  fi
fi

"$ROOT/scripts/desktop-prepare.sh"

echo "==> Installing desktop deps (Tauri CLI)"
pnpm --filter @vast/desktop install

echo "==> Package sidecar (API + SPA + Node runtime)"
bash "$ROOT/scripts/desktop-package-sidecar.sh"

# Pass flags to the Tauri CLI directly. Do NOT use `pnpm run build -- --bundles …`:
# that injects a bare `--`, and Tauri forwards it to cargo (which then dies on
# `unexpected argument '--bundles'`).
echo "==> tauri build${EXTRA[*]:+ ${EXTRA[*]}}"
TAURI_ARGS=()
if [[ "$DEBUG" -eq 1 ]]; then
  TAURI_ARGS+=(--debug)
  BUNDLE_ROOT="$ROOT/apps/desktop/src-tauri/target/debug/bundle"
else
  BUNDLE_ROOT="$ROOT/apps/desktop/src-tauri/target/release/bundle"
fi
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  TAURI_ARGS+=("${EXTRA[@]}")
fi

pnpm --filter @vast/desktop exec tauri build "${TAURI_ARGS[@]}"

if [[ "$OS" == "Darwin" && "$WANT_DMG" -eq 1 ]]; then
  APP_PATH="$BUNDLE_ROOT/macos/Vast.app"
  if [[ ! -d "$APP_PATH" ]]; then
    echo "ERROR: expected Vast.app at $APP_PATH" >&2
    exit 1
  fi
  make_macos_dmg "$APP_PATH" "$BUNDLE_ROOT/dmg"
fi

echo ""
echo "==> Done. Bundles (if any):"
if [[ -d "$BUNDLE_ROOT" ]]; then
  find "$BUNDLE_ROOT" \( \
    -type f \( \
      -name '*.dmg' -o -name '*.msi' -o -name '*.exe' \
      -o -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' \
    \) \
    -o -type d -name '*.app' \
  \) 2>/dev/null | grep -v '/Contents/' | sed 's/^/  /' || true
  echo "  Directory: $BUNDLE_ROOT"
  if [[ "$OS" == "Darwin" ]]; then
    APP="$(find "$BUNDLE_ROOT" -type d -name 'Vast.app' 2>/dev/null | head -1 || true)"
    if [[ -n "${APP:-}" ]]; then
      echo ""
      echo "  macOS smoke: open \"$APP\""
      echo "  Standalone: app starts its own localhost API sidecar."
    fi
  fi
else
  echo "  (no bundle dir yet — check tauri build output above)"
fi
