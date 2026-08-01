# Vast Architecture

## Dual runtime

Vast ships as:

1. **Docker / web** — Hono server serves the SPA + `/api/*`
2. **Tauri desktop** — same SPA + Node **sidecar** bound to `127.0.0.1`

```
packages/shared     → types, Zod schemas, errors
packages/mongo-core → Mongo driver, EJSON, crypto, ConnectionManager
apps/server         → Hono HTTP API + static SPA
apps/web            → Vite + React UI
apps/desktop        → Tauri shell (sidecar lifecycle)
apps/e2e            → Playwright
```

## Request path

```
UI  --HTTP JSON-->  apps/server  -->  mongo-core  -->  MongoDB
```

The browser/WebView never holds long-lived Mongo credentials.

## Data directory

| Runtime | Default |
|---------|---------|
| Docker | `/data` volume |
| Desktop | OS app data dir |
| Dev | `./data` |

Stores connection secrets (AES-GCM), jobs, and future SQLite artifacts.

## Security highlights

- Desktop forces `127.0.0.1` bind
- Connection URIs encrypted at rest
- Passwords masked in logs and UI (`uriDisplay`)
- Read-only connections reject writes (enforced in mongo-core / API)
