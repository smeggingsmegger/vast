# Desktop (Tauri)

Status: **scaffold only** (Phase 0). Full wiring is Phase 7.

## Goals

- Same features as Docker/web
- Sidecar `vast-server` on localhost only
- Native installers: macOS / Windows / Linux
- OS app data directory for secrets and jobs

## Planned layout

```
apps/desktop/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/main.rs      # spawn sidecar, health wait, shutdown
    binaries/        # vast-server-<target-triple>
```

## Sidecar env (planned)

```
VAST_RUNTIME=desktop
VAST_BIND=127.0.0.1
VAST_AUTH_MODE=none
VAST_DATA_DIR=<app data>
VAST_SECRET_KEY=<generated>
VAST_WEB_DIST=<bundled spa or served by sidecar>
```

## Security

Desktop **must never** listen on `0.0.0.0` by default. Enforced in `apps/server/src/config.ts`.

## Dev (future)

```bash
pnpm build:web && pnpm build:server && pnpm build:sidecar
pnpm --filter @vast/desktop tauri dev
```
