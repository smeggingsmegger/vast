# macOS code signing & notarization (Tauri)

Ship Vast so other Macs open it without Gatekeeper “damaged” / unidentified developer blocks.

The **release** path matches taffy-local’s `scripts/build-macos-release.sh`:

- **Developer ID Application** identity from the login Keychain (auto-selected if unique)
- **notarytool Keychain profile** (default `taffy-notary`) — no API keys or passwords in the shell
- Tauri **signs**; the script **notarizes + staples** the app and DMG
- **No unsigned fallback**

## Quick release

If you already ship Taffy Local with the same Apple team, you likely have everything:

```bash
# optional only if multiple Developer ID Application identities:
# export APPLE_SIGNING_IDENTITY="Developer ID Application: Taffy Tree LLC (KRTYHAXLD6)"
# optional if you use a different Keychain profile name:
# export APPLE_NOTARY_KEYCHAIN_PROFILE="taffy-notary"

./scripts/desktop-macos-release.sh
# or: pnpm desktop:release:macos
```

Expected preamble:

```text
Signing identity: Developer ID Application: Taffy Tree LLC (KRTYHAXLD6)
Notarization profile: taffy-notary
```

Artifacts:

- `dist-dmg/Vast_<version>_<arch>.dmg` — signed, notarized, stapled, Gatekeeper-checked
- `apps/desktop/src-tauri/target/release/bundle/macos/Vast.app`

Day-to-day local builds (ad-hoc or optional signing only):

```bash
./scripts/desktop-build.sh
```

---

## One-time setup

### 1. Developer ID Application certificate

Requires a paid [Apple Developer Program](https://developer.apple.com) membership.

1. **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**  
   Enter your Apple ID email, choose **Saved to disk**, keep the private key in the login keychain.
2. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list) → create **Developer ID Application** → upload the CSR.  
   Do **not** choose Apple Development or Apple Distribution (App Store).
3. Download and open the `.cer` so it pairs with the private key.
4. Confirm:

```bash
security find-identity -v -p codesigning
```

You want a line like:

```text
"Developer ID Application: Taffy Tree LLC (KRTYHAXLD6)"
```

`Apple Development: …` alone is not enough to ship.

If more than one Developer ID Application identity is installed, set:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Taffy Tree LLC (KRTYHAXLD6)"
```

### 2. Store notarization credentials in the login Keychain

Same pattern as taffy-local: an Apple ID **app-specific password** stored by `notarytool`. Nothing secret is committed or exported as env vars for the release script.

1. [account.apple.com](https://account.apple.com/) → **Sign-In and Security → App-Specific Passwords** → create one (e.g. “Vast / Taffy releases”).
2. Note your 10-character **Team ID** (e.g. `KRTYHAXLD6`).
3. Store credentials (prompts for the app-specific password; not written to shell history):

```bash
xcrun notarytool store-credentials "taffy-notary" \
  --apple-id "you@example.com" \
  --team-id "KRTYHAXLD6"
```

Reuse the existing `taffy-notary` profile if you already built Taffy Local releases. To use another name:

```bash
export APPLE_NOTARY_KEYCHAIN_PROFILE="vast-notary"
```

Validate:

```bash
xcrun notarytool history --keychain-profile taffy-notary
```

### 3. Tools

```bash
xcode-select --install   # if needed
# Rust: https://rustup.rs
# pnpm for the monorepo
```

---

## What the release script does

`./scripts/desktop-macos-release.sh`:

0. Puts Apple system utilities (`/usr/bin`, …) ahead of Conda/Miniforge shims so Tauri gets `/usr/bin/xattr` (not a Python package named `xattr`).
1. Preflights Keychain **Developer ID Application** + **notarytool** profile.
2. Builds sidecar + web + Tauri **app** with signing only  
   (`APPLE_API_*` / `APPLE_ID` / `APPLE_PASSWORD` are cleared so Tauri does not notarize).
3. **Deep-signs** nested Mach-O binaries (bundled `node`, `*.node` native addons
   from `ssh2` / `cpu-features`, etc.) with hardened runtime + timestamp, then
   re-signs the outer `.app`. Tauri alone does not sign Resources/sidecar binaries;
   Apple rejects notarization without this step.
4. Zips the app (`ditto`), submits with  
   `notarytool submit --keychain-profile … --wait`, staples the app.
5. Verifies: deep codesign, hardened runtime, secure timestamp, staple, `spctl`.
6. Builds a UDZO DMG with `hdiutil` (stapled app inside), **codesigns** the DMG.
7. Notarizes + staples the DMG; Gatekeeper-checks it.
8. Stages a copy under `dist-dmg/`.

Notarization can take several minutes; do not distribute an interrupted build.

### Notarization log after a failure

```bash
xcrun notarytool history --keychain-profile "${APPLE_NOTARY_KEYCHAIN_PROFILE:-taffy-notary}"

xcrun notarytool log "SUBMISSION-ID" \
  --keychain-profile "${APPLE_NOTARY_KEYCHAIN_PROFILE:-taffy-notary}"
```

---

## Dev / ad-hoc builds

```bash
./scripts/desktop-build.sh
```

If a unique Developer ID Application identity is present, `desktop-build.sh` may auto-select it for signing; it does **not** run the full notarize/staple/verify pipeline. Use `desktop-macos-release.sh` for anything you give to others.

---

## Manual verify

```bash
codesign -dv --verbose=4 "apps/desktop/src-tauri/target/release/bundle/macos/Vast.app"
spctl -a -vv "apps/desktop/src-tauri/target/release/bundle/macos/Vast.app"
xcrun stapler validate "apps/desktop/src-tauri/target/release/bundle/macos/Vast.app"
spctl --assess --type open --context context:primary-signature -vv dist-dmg/Vast_*.dmg
```

## Notes

- **Never commit** passwords, `.p8`, or `.p12` files.
- Developer ID is for **direct distribution**; Mac App Store uses different certs.
- Before publishing: download the DMG in a browser (quarantine), open without overrides, smoke-test.
- Rotate the app-specific password from Apple ID security settings; re-run `notarytool store-credentials` after rotating.

See also: [Tauri v2 macOS signing](https://v2.tauri.app/distribute/sign/macos/).
