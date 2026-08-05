#!/usr/bin/env bash
# Build, sign, notarize, verify, and stage a macOS DMG for Vast.
#
# Matches taffy-local's scripts/build-macos-release.sh flow:
#   - Developer ID Application from Keychain (auto-select if unique)
#   - notarytool Keychain profile (default: taffy-notary) — no raw passwords in env
#   - Tauri signs only; this script notarizes + staples app and DMG
#   - No unsigned fallback
#
# Setup: docs/SIGNING.md
#
# Optional env:
#   APPLE_SIGNING_IDENTITY          # if multiple Developer ID Application identities
#   APPLE_NOTARY_KEYCHAIN_PROFILE   # default: taffy-notary
#
# Usage:
#   ./scripts/desktop-macos-release.sh
#   pnpm desktop:release:macos
set -euo pipefail

# Tauri invokes macOS system tools such as xattr by name. Conda/Miniforge also
# ships a Python command named xattr that does not support the recursive flags
# Tauri requires, so keep Apple's system tools ahead of environment shims.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

readonly output_dir="dist-dmg"
readonly product_name="Vast"
readonly bundle_root="${ROOT}/apps/desktop/src-tauri/target/release/bundle"

die() {
  echo "macOS release: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' was not found on PATH"
}

developer_identities() {
  security find-identity -v -p codesigning 2>&1 | awk '
    match($0, /"Developer ID Application:[^"]+"/) {
      print substr($0, RSTART + 1, RLENGTH - 2)
    }
  '
}

select_signing_identity() {
  local candidates candidate count selected supplied
  candidates="$(developer_identities || true)"
  supplied="${APPLE_SIGNING_IDENTITY:-}"

  if [[ -n "${supplied}" ]]; then
    selected=""
    while IFS= read -r candidate; do
      if [[ "${candidate}" == "${supplied}" ]]; then
        selected="${candidate}"
        break
      fi
    done <<< "${candidates}"
    [[ -n "${selected}" ]] || die \
      "APPLE_SIGNING_IDENTITY does not name a valid Developer ID Application identity in the Keychain"
  else
    count=0
    selected=""
    while IFS= read -r candidate; do
      [[ -n "${candidate}" ]] || continue
      count=$((count + 1))
      selected="${candidate}"
    done <<< "${candidates}"

    if [[ "${count}" -eq 0 ]]; then
      die "no valid Developer ID Application identity is installed; see docs/SIGNING.md"
    fi
    if [[ "${count}" -ne 1 ]]; then
      echo "macOS release: multiple Developer ID Application identities are installed:" >&2
      while IFS= read -r candidate; do
        [[ -n "${candidate}" ]] && echo "  ${candidate}" >&2
      done <<< "${candidates}"
      die "set APPLE_SIGNING_IDENTITY to the exact identity to use"
    fi
  fi

  export APPLE_SIGNING_IDENTITY="${selected}"
  echo "Signing identity: ${APPLE_SIGNING_IDENTITY}"
}

validate_notary_profile() {
  local profile="$1"
  [[ -n "${profile}" ]] || die "APPLE_NOTARY_KEYCHAIN_PROFILE cannot be empty"
  echo "Notarization profile: ${profile}"
  xcrun notarytool history --keychain-profile "${profile}" >/dev/null || die \
    "notarytool could not use Keychain profile '${profile}'; recreate it as described in docs/SIGNING.md"
}

# Sign every Mach-O inside the bundle (Node + native .node addons), then the app.
# Tauri signs the main executable/app shell but not Resources/sidecar binaries —
# Apple rejects notarization without Developer ID + secure timestamp on those.
deep_sign_app_bundle() {
  local app_path="$1"
  local entitlements="${ROOT}/apps/desktop/src-tauri/macos/sidecar.entitlements"
  local f kind count=0

  [[ -f "${entitlements}" ]] || die "missing entitlements: ${entitlements}"
  [[ -d "${app_path}" ]] || die "app bundle missing: ${app_path}"

  echo "==> Deep-signing nested Mach-O binaries (sidecar Node / .node addons)"
  # Clear quarantine / finder attrs that confuse notarization
  xattr -cr "${app_path}" 2>/dev/null || true

  # Prefer name/extension filters (full tree walk with `file` is huge: Node headers).
  local -a candidates=()
  while IFS= read -r -d '' f; do
    candidates+=("${f}")
  done < <(find "${app_path}/Contents" -type f \( \
    -name '*.node' -o -name '*.dylib' -o -name '*.so' -o -name '*.jnilib' \
    -o -name 'node' -o -name 'node.exe' \
    -o -perm +111 \
  \) ! -path '*/Headers/*' ! -path '*/include/*' -print0 2>/dev/null)

  local -a machos=()
  for f in ${candidates[@]+"${candidates[@]}"}; do
    # Skip scripts / non-Mach-O executables quickly
    case "${f}" in
      *.js|*.mjs|*.cjs|*.sh|*.py|*.rb|*.pl) continue ;;
    esac
    kind="$(file -b "${f}" 2>/dev/null || true)"
    case "${kind}" in
      *Mach-O*) machos+=("${f}") ;;
    esac
  done

  # Sort by path length descending (leaf → root)
  if [[ ${#machos[@]} -gt 0 ]]; then
    local sorted
    sorted="$(printf '%s\n' "${machos[@]}" | awk '{ print length, $0 }' | sort -nr | cut -d' ' -f2-)"
    while IFS= read -r f; do
      [[ -n "${f}" ]] || continue
      # Node runtime + native addons need JIT / library-loading entitlements
      case "${f}" in
        */node|*.node|*/node.exe)
          codesign --force --options runtime --timestamp \
            --entitlements "${entitlements}" \
            --sign "${APPLE_SIGNING_IDENTITY}" \
            "${f}"
          ;;
        *)
          codesign --force --options runtime --timestamp \
            --sign "${APPLE_SIGNING_IDENTITY}" \
            "${f}"
          ;;
      esac
      count=$((count + 1))
    done <<< "${sorted}"
  fi
  echo "    signed ${count} nested Mach-O file(s)"
  [[ "${count}" -gt 0 ]] || die "no nested Mach-O binaries found to sign (expected bundled node + .node addons)"

  echo "==> Re-signing outer app bundle"
  # Prefer app entitlements if present; fall back to sidecar set for hardened runtime
  local app_ents="${ROOT}/apps/desktop/src-tauri/macos/Vast.entitlements"
  if [[ ! -f "${app_ents}" ]]; then
    app_ents="${entitlements}"
  fi
  codesign --force --options runtime --timestamp \
    --entitlements "${app_ents}" \
    --sign "${APPLE_SIGNING_IDENTITY}" \
    "${app_path}"

  codesign --verify --deep --strict --verbose=2 "${app_path}"
}

notarize_app() {
  local app_path="$1"
  local archive_path="$2"
  local submit_out submit_id

  echo "Submitting $(basename "${app_path}") for notarization"
  ditto -c -k --keepParent --sequesterRsrc "${app_path}" "${archive_path}"
  if ! submit_out="$(xcrun notarytool submit "${archive_path}" \
    --keychain-profile "${notary_profile}" --wait 2>&1)"; then
    echo "${submit_out}"
    submit_id="$(grep -E 'id: [0-9a-f-]{36}' <<< "${submit_out}" | head -1 | awk '{print $2}')"
    if [[ -n "${submit_id}" ]]; then
      echo "==> notarytool log ${submit_id}"
      xcrun notarytool log "${submit_id}" --keychain-profile "${notary_profile}" || true
    fi
    rm -f "${archive_path}"
    die "Apple rejected or could not notarize ${app_path}"
  fi
  echo "${submit_out}"
  # notarytool --wait can exit 0 only on Accepted; still double-check
  if grep -Eq 'status: (Invalid|Rejected)' <<< "${submit_out}"; then
    submit_id="$(grep -E 'id: [0-9a-f-]{36}' <<< "${submit_out}" | head -1 | awk '{print $2}')"
    if [[ -n "${submit_id}" ]]; then
      echo "==> notarytool log ${submit_id}"
      xcrun notarytool log "${submit_id}" --keychain-profile "${notary_profile}" || true
    fi
    rm -f "${archive_path}"
    die "Apple rejected notarization of ${app_path}"
  fi
  rm -f "${archive_path}"
  xcrun stapler staple "${app_path}"
}

notarize_dmg() {
  local dmg_path="$1"
  echo "Submitting $(basename "${dmg_path}") for notarization"
  xcrun notarytool submit "${dmg_path}" \
    --keychain-profile "${notary_profile}" --wait
  xcrun stapler staple "${dmg_path}"
}

verify_signed_app() {
  local app_path="$1"
  local signature_details executable

  [[ -d "${app_path}" ]] || die "app bundle missing: ${app_path}"

  executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${app_path}/Contents/Info.plist")"
  [[ -x "${app_path}/Contents/MacOS/${executable}" ]] || die \
    "the app's main executable is missing: ${app_path}/Contents/MacOS/${executable}"

  echo "==> codesign --verify (deep/strict)"
  codesign --verify --deep --strict --verbose=2 "${app_path}"
  signature_details="$(codesign -dv --verbose=4 "${app_path}" 2>&1)"

  grep -Fq "Authority=${APPLE_SIGNING_IDENTITY}" <<< "${signature_details}" || die \
    "${app_path} is not signed by ${APPLE_SIGNING_IDENTITY}"
  grep -q 'flags=.*runtime' <<< "${signature_details}" || die \
    "${app_path} is not signed with the hardened runtime"
  grep -q '^Timestamp=' <<< "${signature_details}" || die \
    "${app_path} has no secure signing timestamp"

  echo "==> stapler validate (app)"
  xcrun stapler validate "${app_path}"
  echo "==> spctl assess (app)"
  spctl --assess --type execute --verbose=2 "${app_path}"
}

verify_dmg() {
  local dmg_path="$1"
  local signature_details
  codesign --verify --strict --verbose=2 "${dmg_path}"
  signature_details="$(codesign -dv --verbose=4 "${dmg_path}" 2>&1)"
  grep -Fq "Authority=${APPLE_SIGNING_IDENTITY}" <<< "${signature_details}" || die \
    "${dmg_path} is not signed by ${APPLE_SIGNING_IDENTITY}"
  xcrun stapler validate "${dmg_path}"
  spctl --assess --type open --context context:primary-signature --verbose=2 "${dmg_path}"
}

# hdiutil DMG (more reliable than Tauri create-dmg). App must already be stapled.
# Progress goes to stderr; the only stdout line is the absolute DMG path (for capture).
make_and_sign_dmg() {
  local app="$1"
  local out_dir="$2"
  local version arch dmg_name staging out

  version="$(node -p "require('${ROOT}/apps/desktop/package.json').version" 2>/dev/null || echo '0.1.0')"
  arch="$(uname -m)"
  case "$arch" in
    arm64) arch="aarch64" ;;
    x86_64) arch="x64" ;;
  esac
  dmg_name="${product_name}_${version}_${arch}.dmg"
  staging="$(mktemp -d "${TMPDIR:-/tmp}/vast-dmg.XXXXXX")"
  out="${out_dir}/${dmg_name}"

  mkdir -p "${out_dir}"
  rm -f "${out}"

  for m in /Volumes/dmg.*; do
    [[ -e "$m" ]] || continue
    hdiutil detach "$m" -force >/dev/null 2>&1 || true
  done

  echo "==> Creating DMG with hdiutil → ${out}" >&2
  cp -R "${app}" "${staging}/${product_name}.app"
  ln -s /Applications "${staging}/Applications"

  # hdiutil prints "created: …" on stdout — keep it off the captured path
  hdiutil create \
    -volname "${product_name}" \
    -srcfolder "${staging}" \
    -ov \
    -format UDZO \
    -imagekey zlib-level=9 \
    "${out}" >&2

  rm -rf "${staging}"
  [[ -f "${out}" ]] || die "DMG was not created"

  echo "==> codesign DMG" >&2
  codesign --force --timestamp --sign "${APPLE_SIGNING_IDENTITY}" "${out}" >&2
  echo "    DMG ok ($(du -h "${out}" | awk '{print $1}'))" >&2
  # sole stdout line
  printf '%s\n' "${out}"
}

# --- preflight ----------------------------------------------------------------

[[ "$(uname -s)" == "Darwin" ]] || die "this release must be built on macOS"

for required in awk basename codesign cp ditto env grep hdiutil mkdir mktemp mv node pnpm \
  rm security spctl uname xattr xcrun; do
  require_command "${required}"
done
[[ "$(command -v xattr)" == "/usr/bin/xattr" ]] || die \
  "Tauri requires Apple's /usr/bin/xattr, but PATH resolved $(command -v xattr)"
[[ -x /usr/libexec/PlistBuddy ]] || die "required command '/usr/libexec/PlistBuddy' was not found"
xcode-select -p >/dev/null 2>&1 || die "Xcode Command Line Tools required (xcode-select --install)"
command -v rustc >/dev/null || die "Rust is required (https://rustup.rs)"

select_signing_identity
# Same Keychain profile as taffy-local by default (same Apple team).
readonly notary_profile="${APPLE_NOTARY_KEYCHAIN_PROFILE:-taffy-notary}"
validate_notary_profile "${notary_profile}"

version="$(node -p "require('./apps/desktop/package.json').version" 2>/dev/null || echo '0.1.0')"
mkdir -p "${output_dir}"

release_staging_dir="$(mktemp -d "${output_dir}/.staging.XXXXXX")"
cleanup_release_staging() {
  [[ -n "${release_staging_dir:-}" && -d "${release_staging_dir}" ]] && \
    rm -rf "${release_staging_dir}" 2>/dev/null || true
}
trap cleanup_release_staging EXIT HUP INT TERM

echo
echo "Building ${product_name} ${version}"
echo "  identity: ${APPLE_SIGNING_IDENTITY}"
echo "  notary:   ${notary_profile}"

# Avoid macOS signature-cache trap on overwrite of a previously launched app
find "${ROOT}/apps/desktop/src-tauri/target" -maxdepth 6 -type d -name "${product_name}.app" \
  -exec rm -rf {} + 2>/dev/null || true

"$ROOT/scripts/desktop-prepare.sh"

echo "==> Installing desktop deps"
pnpm --filter @vast/desktop install

echo "==> Package sidecar"
bash "$ROOT/scripts/desktop-package-sidecar.sh"

# Tauri signs; this script notarizes (Keychain profile). Clear raw Apple env so
# Tauri does not attempt its own notarization path (same as taffy-local).
echo "==> tauri build --bundles app (sign only; script notarizes)"
env -u APPLE_API_ISSUER -u APPLE_API_KEY -u APPLE_API_KEY_PATH \
  -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
  pnpm --filter @vast/desktop exec tauri build --bundles app

app_path="${bundle_root}/macos/${product_name}.app"
[[ -d "${app_path}" ]] || die "expected app bundle was not produced: ${app_path}"

# Nested Node + ssh2/cpu-features .node modules must be Developer ID signed
# before Apple will accept notarization (see notary issues on .node paths).
deep_sign_app_bundle "${app_path}"

notarize_app "${app_path}" "${release_staging_dir}/vast-${version}.zip"
verify_signed_app "${app_path}"

dmg_path="$(make_and_sign_dmg "${app_path}" "${bundle_root}/dmg")"
notarize_dmg "${dmg_path}"
verify_dmg "${dmg_path}"

staged="${output_dir}/$(basename "${dmg_path}")"
cp -p "${dmg_path}" "${staged}"
verify_dmg "${staged}"

rm -rf "${release_staging_dir}"
release_staging_dir=""
trap - EXIT HUP INT TERM

echo
echo "Signed and notarized macOS release complete:"
echo "  ${staged}"
echo "  ${app_path}"
echo
echo "Before distributing: download the DMG via a browser (quarantine), open without"
echo "Privacy & Security overrides, and smoke-test connections + script shell."
