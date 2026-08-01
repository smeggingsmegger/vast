# Vast Desktop (Tauri)

Scaffold placeholder for the Tauri 2 shell.

## Planned architecture

1. Package `apps/server` as a sidecar binary (`vast-server-<triple>`).
2. Tauri spawns the sidecar on `127.0.0.1:<ephemeralPort>`.
3. WebView loads that origin (same SPA as Docker).
4. Data directory uses the OS app data path.

Full design: [docs/DESKTOP.md](../../docs/DESKTOP.md).

## Phase 7 checklist

- [ ] `src-tauri/` with Tauri 2
- [ ] Sidecar packaging script
- [ ] Health-wait before showing window
- [ ] Graceful shutdown
- [ ] Native file dialogs for import/export
- [ ] CI matrix builds (macOS / Windows / Linux)
