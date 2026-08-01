# Features

## Implemented (v0.1 professional workbench)

### Connections
- [x] Save / edit / delete connections (AES-GCM encrypted at rest)
- [x] Test URI, connect / disconnect
- [x] Masked URI display (passwords never shown)
- [x] Per-connection read-only flag
- [x] Server info panel when connected

### Navigation & shell
- [x] Dark / light theme
- [x] Command palette (⌘K / Ctrl+K)
- [x] Breadcrumbs and deep routes: `/c/:cid/db/:db/col/:col`
- [x] Loading / empty / error states on main flows

### Databases & collections
- [x] List / create / drop databases (type-to-confirm)
- [x] List / create / drop collections (type-to-confirm)
- [x] Dump database (logical Vast archive)

### Documents
- [x] Paginated find with JSON filter + field filter builder
- [x] Results grid with BSON type badges
- [x] Document inspector: JSON editor + field tree
- [x] Insert / replace / patch / delete
- [x] Field type conversion (string, int, long, double, decimal, bool, date, objectId, null)
- [x] EJSON round-trip for ObjectId, Date, Long, Decimal128, nested docs/arrays

### Aggregation
- [x] Pipeline JSON editor + run + results

### Indexes
- [x] List / create / drop (protect `_id_`)

### Schema
- [x] Sample-based field presence and type distribution

### Import / export / dump / restore
- [x] Import JSON / JSONL
- [x] Export JSON / JSONL / CSV
- [x] Logical dump + restore with indexes

### Safety & auth
- [x] Read-only connections reject writes (API + tests)
- [x] Destructive drop confirmations
- [x] Password auth mode (`VAST_AUTH_MODE=password`)
- [x] Desktop forces `127.0.0.1` bind

### Runtimes
- [x] Docker image serves SPA + API
- [x] Tauri 2 desktop scaffold (sidecar lifecycle, cargo check green)
- [x] Playwright E2E (smoke + workbench journey against real Mongo)
- [x] Integration tests against real MongoDB
