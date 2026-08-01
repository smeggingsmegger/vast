#!/usr/bin/env python3
"""
Sync Vast branding from logos/vast-logo-transparent.png into:

  - logos/vast-icon-512.png          (square app icon source)
  - apps/web/public/vast-logo.png    (UI mark)
  - apps/web/public/favicon*.png

Then regenerate Tauri icons:

  cd apps/desktop && pnpm exec tauri icon ../../logos/vast-icon-512.png

Usage (repo root):
  python3 scripts/logo-sync-icons.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "logos" / "vast-logo-transparent.png"


def make_icon(logo: Image.Image, side: int, fill: float = 0.78) -> Image.Image:
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    lw, lh = logo.size
    scale = min((side * fill) / lw, (side * fill) / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((side - nw) // 2, (side - nh) // 2), resized)
    return canvas


def main() -> int:
    if not SRC.is_file():
        print(f"Missing {SRC.relative_to(ROOT)}", file=sys.stderr)
        print("Place your transparent logo at logos/vast-logo-transparent.png", file=sys.stderr)
        return 1

    logo = Image.open(SRC).convert("RGBA")
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)

    icon512 = make_icon(logo, 512)
    out_icon = ROOT / "logos" / "vast-icon-512.png"
    icon512.save(out_icon, "PNG", optimize=True)
    print(f"wrote {out_icon.relative_to(ROOT)}")

    public = ROOT / "apps" / "web" / "public"
    public.mkdir(parents=True, exist_ok=True)

    web_logo = logo.copy()
    web_logo.thumbnail((256, 256), Image.Resampling.LANCZOS)
    web_logo.save(public / "vast-logo.png", "PNG", optimize=True)
    make_icon(logo, 64).save(public / "favicon-64.png", "PNG", optimize=True)
    make_icon(logo, 32).save(public / "favicon-32.png", "PNG", optimize=True)
    make_icon(logo, 32).save(public / "favicon.png", "PNG", optimize=True)
    print(f"wrote apps/web/public/{{vast-logo,favicon*}}.png")

    # Optional: tauri icon if CLI available
    desktop = ROOT / "apps" / "desktop"
    if (desktop / "package.json").is_file():
        print("regenerating Tauri icons…")
        r = subprocess.run(
            ["pnpm", "exec", "tauri", "icon", str(out_icon)],
            cwd=desktop,
        )
        if r.returncode != 0:
            print("tauri icon failed (install desktop deps / run later)", file=sys.stderr)
            return r.returncode
        print("wrote apps/desktop/src-tauri/icons/*")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
