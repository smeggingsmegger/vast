# Vast Desktop (Tauri)

Tauri 2 shell for the Vast workbench.

## Build installers (this OS)

From repo root:

```bash
pnpm install
pnpm desktop:build
# packages API + SPA + Node, then builds
# → apps/desktop/src-tauri/target/release/bundle/
```

Dev (standalone — no separate server):

```bash
pnpm desktop:dev
```

On launch the app starts a localhost API and opens the UI there, so connections load without `pnpm dev:server`.

## All platforms

Use CI (`.github/workflows/desktop.yml`) or build on each OS. See [docs/DESKTOP.md](../../docs/DESKTOP.md).

## Architecture

1. Bundle SPA (`apps/web/dist`) into the WebView.
2. Sidecar `vast-server` on `127.0.0.1` (lifecycle in `src-tauri/src/lib.rs`).
3. OS app data dir for secrets/jobs.

## Checklist

- [x] `src-tauri/` Tauri 2
- [x] Local + CI build scripts
- [ ] Sidecar packaging script (`externalBin`)
- [ ] Health-wait before showing window
- [ ] Graceful shutdown polish
- [ ] Native file dialogs for import/export
- [x] CI matrix builds (macOS / Windows / Linux)
