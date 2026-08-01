# Vast

**MongoDB workbench for browser and desktop.**

Browse databases, run finds and aggregations, edit documents (JSON + field types), manage indexes, import/export, dump/restore — with a polished dark/light UI, Docker deploy, and a Tauri desktop shell.

## Quick start

```bash
# Prerequisites: Node 22+, pnpm 11+, MongoDB (or Docker)
pnpm install
pnpm --filter @vast/shared build && pnpm --filter @vast/mongo-core build

# Test Mongo on :27027 (example)
docker run -d --name vast-mongo-test -p 27027:27017 mongo:7

pnpm dev
# UI  http://127.0.0.1:5173
# API http://127.0.0.1:8080
```

## Docker

```bash
docker build -f docker/Dockerfile -t vast:local .
docker run --rm -p 8080:8080 \
  -e VAST_SECRET_KEY=change-me \
  -e VAST_AUTH_MODE=none \
  -v vast-data:/data \
  vast:local
```

Open http://localhost:8080 — add a connection to your MongoDB URI.

| Variable | Purpose |
|----------|---------|
| `VAST_SECRET_KEY` | Encrypt stored connection URIs (required in production) |
| `VAST_AUTH_MODE` | `none` \| `password` \| `oidc` |
| `VAST_PASSWORD` | Admin password when `authMode=password` |
| `VAST_DATA_DIR` | Persistent data (default `/data`) |
| `VAST_RUNTIME` | `web` \| `desktop` \| `dev` |
| `VAST_BIND` | Listen address (`127.0.0.1` forced for desktop) |

## Features

See [docs/FEATURES.md](docs/FEATURES.md) for the full checklist.

**Highlights:** encrypted connections (Mongo + **SSH tunnels** with password or private key), type-aware **single-field edit** (double-click cell or Fields → Edit), full JSON editor, aggregation, indexes, schema, import/export, dump/restore, read-only mode, command palette, dark/light theme.

## Tests

```bash
# Unit (EJSON, crypto, type convert, schema, config bind safety)
pnpm test:unit

# Integration against real MongoDB
MONGO_URI=mongodb://127.0.0.1:27027 pnpm test:integration

# Playwright (smoke + workbench journey)
pnpm --filter @vast/web build
MONGO_URI=mongodb://127.0.0.1:27027 pnpm test:e2e
```

## Monorepo

```
apps/web         Vite + React SPA
apps/server      Hono API + static hosting
apps/desktop     Tauri 2 shell (sidecar lifecycle)
apps/e2e         Playwright
packages/shared  Zod schemas, errors
packages/mongo-core  Driver services, EJSON, dump/restore
docker/
docs/
```

## Desktop (Tauri)

Scaffold under `apps/desktop` — `cargo check` compiles. Sidecar packaging and installers are wired for Phase completion; desktop always binds the API to **localhost only**.

See [docs/DESKTOP.md](docs/DESKTOP.md).

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Security](docs/SECURITY.md)
- [Features](docs/FEATURES.md)

## License

TBD
