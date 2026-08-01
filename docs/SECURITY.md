# Security

## Threat model (v0.1)

Vast is a powerful database admin tool. Anyone who can reach the HTTP API can perform MongoDB operations permitted by stored connection credentials.

### Docker / web

- Prefer `VAST_AUTH_MODE=password` (or OIDC later) in any shared network
- Set a strong `VAST_SECRET_KEY`
- Put TLS termination in front (reverse proxy)
- Prefer private networks / VPN

### Desktop

- Sidecar binds `127.0.0.1` only
- App auth defaults to `none` (OS user boundary)
- Secret key generated/stored under app data with restricted permissions (Phase 7)

## Secrets

- Connection URIs encrypted at rest (AES-256-GCM)
- Masked in API responses and logs
- Never commit `.env` or `/data`

## Destructive operations

- Type-to-confirm for drop database/collection (later phases)
- Per-connection read-only flag
