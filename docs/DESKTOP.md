# Desktop (Tauri)

Vast ships a **Tauri 2** shell under `apps/desktop`. The web UI is bundled into the native app; the Node API is intended as a localhost **sidecar** (spawned by the shell).

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node 22+** / **pnpm 11+** | Monorepo |
| **Rust** (stable) | [rustup.rs](https://rustup.rs) |
| **Platform deps** | See below |
| **Apple signing (optional)** | Dev: ad-hoc via `desktop:build`. Ship: `pnpm desktop:release:macos` — see [SIGNING.md](./SIGNING.md) |

### macOS

```bash
xcode-select --install   # if needed
# Optional: create-dmg tooling is handled by Tauri
```

**Verified:** `pnpm desktop:build` on Apple Silicon produces:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Vast.app
apps/desktop/src-tauri/target/release/bundle/dmg/Vast_0.1.0_aarch64.dmg
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
  patchelf libssl-dev build-essential curl wget file
```

### Windows

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- WebView2 (usually preinstalled on Win10/11)

---

## Quick scripts

From the **repo root**:

```bash
# One-time / whenever deps change
pnpm install
pnpm --filter @vast/desktop install

# Package the API + SPA + Node runtime into the app resources
pnpm desktop:sidecar

# Dev (packages sidecar, then Tauri — fully standalone)
pnpm desktop:dev

# Release installers for *this* machine’s OS (packages sidecar + builds)
pnpm desktop:build
```

The desktop app **starts its own API** on `127.0.0.1` and loads the UI from that origin — no separate `pnpm dev:server` required.

### What gets produced

Tauri writes under:

```text
apps/desktop/src-tauri/target/release/bundle/
```

| OS | Typical artifacts |
|----|-------------------|
| **macOS** | `.app`, `.dmg` |
| **Windows** | `.msi`, NSIS `.exe` |
| **Linux** | `.deb`, `.AppImage`, `.rpm` (if tools present) |

`tauri.conf.json` has `"targets": "all"` — Tauri builds whatever the host supports.

Optional flags:

```bash
./scripts/desktop-build.sh --debug
./scripts/desktop-build.sh --bundles dmg          # macOS example
./scripts/desktop-build.sh --bundles msi,nsis     # Windows
./scripts/desktop-build.sh --bundles deb,appimage # Linux
```

---

## Multi-platform (Windows + Linux + Mac)

**You cannot reliably build all three installers on one laptop.**  
Tauri/native toolchains need the target OS (especially macOS signing and Windows installers).

### Option A — GitHub Actions (recommended)

Workflow: [`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml)

- Runs on `macos-latest`, `ubuntu-22.04`, `windows-latest`
- Uploads artifacts named `vast-desktop-macOS` / `Linux` / `Windows`
- Triggers: `workflow_dispatch` or version tags `v*`

```bash
# Trigger from GitHub UI: Actions → Desktop → Run workflow
# Or push a tag:
git tag v0.1.0 && git push origin v0.1.0
```

Download the three artifacts from the run summary.

### Option B — Three machines / VMs

On each OS checkout the same commit and run:

```bash
pnpm install
./scripts/desktop-build.sh
```

Collect bundles from `apps/desktop/src-tauri/target/release/bundle/`.

### Option C — Cross-compile (not recommended for installers)

Rust *can* cross-compile binaries with extra targets, but **installer packaging** (dmg, msi, AppImage) almost always requires the host OS. Prefer the CI matrix.

---

## Architecture notes

```text
┌─────────────────────────────┐
│  Tauri WebView              │  navigates to http://127.0.0.1:<port>/
└─────────────┬───────────────┘
              │ same-origin /api/*
┌─────────────▼───────────────┐
│  Bundled Node sidecar       │  resources/sidecar/
│  • Node runtime             │
│  • apps/server (deployed)   │
│  • web-dist (SPA)           │
│  VAST_BIND=127.0.0.1 only   │
└─────────────────────────────┘
```

- Desktop **must not** bind `0.0.0.0` (enforced in server config).
- On launch, Tauri picks a free port, starts the sidecar, waits for `/api/health`, then loads that URL.
- Data + encryption key: `~/Library/Application Support/Vast` (macOS).

### Sidecar packaging

```bash
pnpm desktop:sidecar
# → apps/desktop/src-tauri/resources/sidecar/
#    node/  server/  web-dist/  vast-server
```

`pnpm desktop:build` runs this automatically before `tauri build`.

---

## Manual Tauri CLI

```bash
cd apps/desktop
pnpm exec tauri info     # diagnose toolchains
pnpm exec tauri dev
pnpm exec tauri build
```

Config: `apps/desktop/src-tauri/tauri.conf.json`  
- `beforeBuildCommand` → builds `@vast/web`  
- `frontendDist` → `../../web/dist`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `webkit2gtk` missing (Linux) | Install packages listed above |
| `link.exe` / MSVC (Windows) | Install C++ Build Tools |
| Empty `bundle/` | Read full `tauri build` log; often icon/deps |
| UI loads, API fails | Start `pnpm dev:server` or finish sidecar packaging |
| Codesign / notarize (Mac) | Needs Apple Developer cert + `APPLE_*` env in CI |

---

## Checklist

- [x] `src-tauri/` Tauri 2 scaffold
- [x] Local build scripts (`scripts/desktop-*.sh`)
- [x] CI matrix for macOS / Windows / Linux
- [ ] Sidecar binary packaging + `externalBin`
- [ ] Health-wait before showing window (production)
- [ ] macOS notarization / Windows signing
