# Features

## Implemented (professional workbench)

### Connections
- [x] Save / edit / delete connections
- [x] **AES-GCM encryption** of Mongo URIs and SSH secrets (`VAST_SECRET_KEY`)
- [x] Masked URI display — passwords never returned by list/get API
- [x] Test / connect / disconnect
- [x] Per-connection read-only flag
- [x] **SSH tunnel** (password or private key + optional passphrase)
- [x] SSH destination host/port (Mongo as seen from bastion)
- [x] Server info panel when connected

### Single-field editing
- [x] **Type-aware field editor** (modal) for string, int, long, decimal, double, bool, date, ObjectId, null, JSON
- [x] **Double-click grid cell** → edit that field
- [x] **Edit** on Fields tree (nested paths)
- [x] Server `set-field` API with Long/Date/Decimal fidelity (canonical EJSON)
- [x] Field type conversion (type badge → convert)

### Navigation & shell
- [x] Dark / light theme
- [x] Command palette (⌘K / Ctrl+K)
- [x] Breadcrumbs and deep routes
- [x] Loading / empty / error / success toasts on main flows
- [x] Document inspector defaults to Fields view for quick edits

### Databases & collections
- [x] List / create / drop (type-to-confirm)
- [x] Dump database (logical archive)

### Documents
- [x] Paginated find, JSON + field filter builders
- [x] Results grid with BSON type badges
- [x] **Horizontal scroll** for wide collections
- [x] **Show / hide columns** (Columns menu)
- [x] **Resizable columns** (drag header edge; widths saved in views)
- [x] **Click column headers to sort** (asc → desc → clear)
- [x] **Copy value** as string or mongosh form (hover icons + right-click menu)
- [x] **Saved views** (columns + widths + sort + filter, per collection, browser-local)
- [x] Full JSON replace editor
- [x] Insert / delete

### Aggregation / indexes / schema
- [x] Pipeline editor + run
- [x] Index list / create / drop
- [x] Schema sampling

### Import / export / dump / restore
- [x] Import JSON / JSONL
- [x] Export JSON / JSONL / CSV
- [x] Logical dump + restore (path-confined to jobs dir)

### Safety
- [x] Read-only connections reject writes
- [x] Drop confirmations
- [x] Password auth mode for web deployments
- [x] Desktop bind forced to 127.0.0.1

### Runtimes & quality
- [x] Docker image
- [x] Tauri desktop scaffold
- [x] Unit + real-Mongo integration + Playwright E2E
- [x] Real SSH tunnel integration tests (when bastion available)
