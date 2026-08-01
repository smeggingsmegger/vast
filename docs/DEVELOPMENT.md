# Development

## Prerequisites

- Node.js 22+
- pnpm 11+
- Docker (optional, for Mongo + image builds)
- Rust + Tauri deps (desktop only, Phase 7)

## Setup

```bash
pnpm install
pnpm --filter @vast/shared build
pnpm --filter @vast/mongo-core build
```

## Run locally

Terminal A — API:

```bash
export VAST_RUNTIME=dev
export VAST_AUTH_MODE=none
export VAST_SECRET_KEY=dev-secret
export VAST_DATA_DIR=./data/dev
pnpm dev:server
```

Terminal B — UI (proxies `/api` → `:8080`):

```bash
pnpm dev:web
```

Or both:

```bash
pnpm dev
```

Open http://127.0.0.1:5173

## MongoDB

```bash
docker compose -f docker/docker-compose.yml up mongo -d
```

Default URI: `mongodb://localhost:27017`

## Tests

```bash
pnpm test:unit
pnpm --filter @vast/web build   # needed for e2e static serve
pnpm test:e2e
```

## Docker

```bash
pnpm docker:up
# http://localhost:8080
```

## Package graph

Build order: `shared` → `mongo-core` → `server` / `web`
