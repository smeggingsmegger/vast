import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { VastConfig } from './config.js';
import { ErrorCode, VastError } from '@vast/shared';

const COOKIE = 'vast_session';
const sessions = new Map<string, { expires: number }>();

function hashPassword(password: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${password}`).digest('hex');
}

export function verifyPassword(config: VastConfig, password: string): boolean {
  if (config.authMode === 'none') return true;
  if (!config.password) return false;
  const a = Buffer.from(hashPassword(password, config.secretKey));
  const b = Buffer.from(hashPassword(config.password, config.secretKey));
  // Compare via re-hash of configured password stored as plaintext env for v1
  const expected = Buffer.from(hashPassword(config.password, config.secretKey));
  const actual = Buffer.from(hashPassword(password, config.secretKey));
  void a;
  void b;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function createSession(ttlMs = 24 * 60 * 60 * 1000): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + ttlMs });
  return token;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

export function isSessionValid(token: string | undefined): boolean {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function authMiddleware(config: VastConfig) {
  return async (c: Context, next: Next) => {
    if (config.authMode === 'none') return next();
    const path = new URL(c.req.url).pathname;
    if (path === '/api/health' || path === '/api/v1/meta' || path === '/api/v1/auth/login') {
      return next();
    }
    if (!path.startsWith('/api/')) return next();
    const token = getCookie(c, COOKIE);
    if (!isSessionValid(token)) {
      throw new VastError(ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    return next();
  };
}

export function setSessionCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure,
    maxAge: 60 * 60 * 24,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' });
}
