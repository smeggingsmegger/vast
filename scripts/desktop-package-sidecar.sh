#!/usr/bin/env bash
# Package the Node API + SPA + Node runtime for the Tauri desktop sidecar.
# Output: apps/desktop/src-tauri/resources/sidecar/
#
# Avoids `pnpm deploy` (it can strip monorepo devDependencies).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="$ROOT/apps/desktop/src-tauri/resources/sidecar"
NODE_VERSION="${VAST_SIDECAR_NODE_VERSION:-22.14.0}"

echo "==> Packaging desktop sidecar → $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/server/vendor"

echo "==> Build packages + web + server"
# Never run this step under NODE_ENV=production
(
  unset NODE_ENV
  export NODE_ENV=development
  pnpm --filter @vast/shared build
  pnpm --filter @vast/mongo-core build
  pnpm --filter @vast/server build
  pnpm --filter @vast/web build
)

echo "==> Stage @vast packages (dist + package.json only)"
stage_pkg() {
  local name="$1"
  local src="$ROOT/packages/$name"
  local dest="$OUT/server/vendor/$name"
  mkdir -p "$dest"
  cp "$src/package.json" "$dest/"
  cp -a "$src/dist" "$dest/dist"
}
stage_pkg shared
stage_pkg mongo-core

echo "==> Stage server dist + package.json (file: vendors)"
cp -a "$ROOT/apps/server/dist" "$OUT/server/dist"
# Rewrite workspace deps to local file: vendors for a standalone npm install
ROOT="$ROOT" node --input-type=module << 'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.ROOT || process.cwd();
const outServer = join(root, 'apps/desktop/src-tauri/resources/sidecar/server');
const pkg = JSON.parse(readFileSync(join(root, 'apps/server/package.json'), 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
pkg.private = true;
pkg.dependencies = {
  ...pkg.dependencies,
  '@vast/shared': 'file:./vendor/shared',
  '@vast/mongo-core': 'file:./vendor/mongo-core',
};
// Ensure vendor package.json point at dist and no workspace: protocols
for (const name of ['shared', 'mongo-core']) {
  const p = join(outServer, 'vendor', name, 'package.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.main = './dist/index.js';
  j.types = './dist/index.d.ts';
  j.exports = {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
    },
  };
  delete j.devDependencies;
  delete j.scripts;
  if (j.dependencies) {
    for (const [dep, ver] of Object.entries(j.dependencies)) {
      if (typeof ver === 'string' && ver.startsWith('workspace:')) {
        if (dep === '@vast/shared') j.dependencies[dep] = 'file:../shared';
        else if (dep === '@vast/mongo-core') j.dependencies[dep] = 'file:../mongo-core';
        else delete j.dependencies[dep];
      }
    }
  }
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
writeFileSync(join(outServer, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log('wrote standalone server package.json');
NODE

echo "==> npm install server deps (isolated, does not touch monorepo)"
(
  cd "$OUT/server"
  # Allow install scripts so optional native bits (ssh2) can build
  npm install --omit=dev --no-fund --no-audit 2>&1 | tail -30
)

echo "==> Copy web dist"
cp -a "$ROOT/apps/web/dist" "$OUT/web-dist"

# ── Platform Node binary ────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) NODE_PLAT="darwin-arm64" ;;
      x86_64) NODE_PLAT="darwin-x64" ;;
      *) echo "Unsupported macOS arch: $ARCH"; exit 1 ;;
    esac
    NODE_ARCHIVE="node-v${NODE_VERSION}-${NODE_PLAT}.tar.gz"
    ;;
  Linux)
    case "$ARCH" in
      aarch64|arm64) NODE_PLAT="linux-arm64" ;;
      x86_64) NODE_PLAT="linux-x64" ;;
      *) echo "Unsupported Linux arch: $ARCH"; exit 1 ;;
    esac
    NODE_ARCHIVE="node-v${NODE_VERSION}-${NODE_PLAT}.tar.gz"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    NODE_PLAT="win-x64"
    NODE_ARCHIVE="node-v${NODE_VERSION}-${NODE_PLAT}.zip"
    ;;
  *)
    NODE_PLAT=""
    NODE_ARCHIVE=""
    ;;
esac

CACHE="$ROOT/apps/desktop/.sidecar-cache"
mkdir -p "$CACHE"

if [[ -n "$NODE_ARCHIVE" ]]; then
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
  echo "==> Fetching Node ${NODE_VERSION} (${NODE_PLAT})"
  if [[ ! -f "$CACHE/$NODE_ARCHIVE" ]]; then
    curl -fsSL "$URL" -o "$CACHE/$NODE_ARCHIVE"
  else
    echo "    (cached)"
  fi
  mkdir -p "$OUT/node"
  if [[ "$NODE_ARCHIVE" == *.zip ]]; then
    TMP=$(mktemp -d)
    unzip -q "$CACHE/$NODE_ARCHIVE" -d "$TMP"
    cp -a "$TMP"/node-v"${NODE_VERSION}"-"${NODE_PLAT}"/* "$OUT/node/"
    rm -rf "$TMP"
  else
    tar -xzf "$CACHE/$NODE_ARCHIVE" -C "$OUT/node" --strip-components=1
  fi
  if [[ -x "$OUT/node/bin/node" ]]; then
    echo "    node: $($OUT/node/bin/node -v)"
  elif [[ -f "$OUT/node/node.exe" ]]; then
    echo "    node: win binary present"
  else
    echo "ERROR: node binary missing after extract"
    exit 1
  fi
fi

cat > "$OUT/vast-server" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -x "$ROOT/node/bin/node" ]]; then
  NODE="$ROOT/node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  echo "vast-server: no Node.js runtime found" >&2
  exit 127
fi
export NODE_ENV=production
export VAST_RUNTIME="${VAST_RUNTIME:-desktop}"
export VAST_BIND="${VAST_BIND:-127.0.0.1}"
export VAST_AUTH_MODE="${VAST_AUTH_MODE:-none}"
export VAST_WEB_DIST="${VAST_WEB_DIST:-$ROOT/web-dist}"
cd "$ROOT/server"
exec "$NODE" "$ROOT/server/dist/index.js"
EOF
chmod +x "$OUT/vast-server"

cat > "$OUT/vast-server.cmd" << 'EOF'
@echo off
setlocal
set ROOT=%~dp0
if exist "%ROOT%node\node.exe" (set NODE=%ROOT%node\node.exe) else (set NODE=node)
set NODE_ENV=production
if "%VAST_RUNTIME%"=="" set VAST_RUNTIME=desktop
if "%VAST_BIND%"=="" set VAST_BIND=127.0.0.1
if "%VAST_AUTH_MODE%"=="" set VAST_AUTH_MODE=none
if "%VAST_WEB_DIST%"=="" set VAST_WEB_DIST=%ROOT%web-dist
cd /d "%ROOT%server"
"%NODE%" "%ROOT%server\dist\index.js"
EOF

echo "==> Smoke-check sidecar"
PORT_TEST=17999
export PORT=$PORT_TEST
export VAST_RUNTIME=desktop
export VAST_BIND=127.0.0.1
export VAST_AUTH_MODE=none
export VAST_DATA_DIR="$OUT/.smoke-data"
export VAST_SECRET_KEY="desktop-smoke-secret"
export VAST_WEB_DIST="$OUT/web-dist"
mkdir -p "$VAST_DATA_DIR"
"$OUT/vast-server" &
SIDECAR_PID=$!
cleanup() { kill "$SIDECAR_PID" 2>/dev/null || true; wait "$SIDECAR_PID" 2>/dev/null || true; }
trap cleanup EXIT
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT_TEST}/api/health" 2>/dev/null | grep -q ok; then
    ok=1
    break
  fi
  # bail early if process died
  if ! kill -0 "$SIDECAR_PID" 2>/dev/null; then
    echo "sidecar exited early"
    break
  fi
  sleep 0.15
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: sidecar failed health check on port $PORT_TEST"
  exit 1
fi
# also hit connections list
curl -fsS "http://127.0.0.1:${PORT_TEST}/api/v1/connections" | head -c 200
echo ""
echo "    health + connections ok on :$PORT_TEST"
cleanup
trap - EXIT
rm -rf "$OUT/.smoke-data"

echo "==> Sidecar ready"
du -sh "$OUT" "$OUT/server" "$OUT/web-dist" "$OUT/node" 2>/dev/null || true
