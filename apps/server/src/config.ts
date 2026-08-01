import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthMode, VastRuntime } from '@vast/shared';

export interface VastConfig {
  port: number;
  bind: string;
  runtime: VastRuntime;
  authMode: AuthMode;
  password: string | undefined;
  secretKey: string;
  dataDir: string;
  readOnly: boolean;
  maxQueryDocs: number;
  maxImportBytes: number;
  basePath: string;
  logLevel: string;
  webDistDir: string | undefined;
  version: string;
}

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = env(name);
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes';
}

function envInt(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): VastConfig {
  const runtime = (env('VAST_RUNTIME', 'web') ?? 'web') as VastRuntime;
  if (runtime !== 'web' && runtime !== 'desktop' && runtime !== 'dev') {
    throw new Error(`Invalid VAST_RUNTIME: ${runtime}`);
  }

  const authMode = (env('VAST_AUTH_MODE', runtime === 'desktop' ? 'none' : 'none') ??
    'none') as AuthMode;

  // Desktop must never default to LAN bind.
  const defaultBind = runtime === 'desktop' ? '127.0.0.1' : '0.0.0.0';
  let bind = env('VAST_BIND', defaultBind) ?? defaultBind;
  if (runtime === 'desktop' && bind !== '127.0.0.1' && bind !== 'localhost') {
    // Hard safety: force localhost for desktop sidecar.
    bind = '127.0.0.1';
  }

  const secretKey =
    env('VAST_SECRET_KEY') ??
    (runtime === 'dev' || runtime === 'desktop' || env('NODE_ENV') !== 'production'
      ? 'dev-insecure-secret-change-me'
      : undefined);

  if (!secretKey) {
    throw new Error('VAST_SECRET_KEY is required in production');
  }

  const dataDir = resolve(env('VAST_DATA_DIR', './data') ?? './data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const webDistDir = env('VAST_WEB_DIST')
    ? resolve(env('VAST_WEB_DIST')!)
    : existsSync(resolve(process.cwd(), '../web/dist'))
      ? resolve(process.cwd(), '../web/dist')
      : existsSync(resolve(process.cwd(), 'public'))
        ? resolve(process.cwd(), 'public')
        : undefined;

  return {
    port: envInt('PORT', 8080),
    bind,
    runtime,
    authMode,
    password: env('VAST_PASSWORD'),
    secretKey,
    dataDir,
    readOnly: envBool('VAST_READ_ONLY', false),
    maxQueryDocs: envInt('VAST_MAX_QUERY_DOCS', 10_000),
    maxImportBytes: envInt('VAST_MAX_IMPORT_BYTES', 536_870_912),
    basePath: env('VAST_BASE_PATH', '/') ?? '/',
    logLevel: env('VAST_LOG_LEVEL', 'info') ?? 'info',
    webDistDir,
    version: env('VAST_VERSION', '0.1.0') ?? '0.1.0',
  };
}
