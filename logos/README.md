# Vast logos

## Source of truth

**`vast-logo-transparent.png`** — master mark (RGBA, transparent background).

Replace this file whenever branding updates, then regenerate derived assets:

```bash
python3 scripts/logo-sync-icons.py
```

That writes:

| Output | Use |
|--------|-----|
| `logos/vast-icon-512.png` | Square source for Tauri / app stores |
| `apps/web/public/vast-logo.png` | In-app header / login |
| `apps/web/public/favicon*.png` | Browser tab icon |
| `apps/desktop/src-tauri/icons/*` | macOS / Windows / Linux installers |

Requires: `pillow`, and desktop deps for `tauri icon`.
