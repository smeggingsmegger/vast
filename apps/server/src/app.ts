import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { ZodError } from 'zod';
import {
  CreateConnectionSchema,
  ErrorCode,
  LoginBodySchema,
  TestConnectionSchema,
  UpdateConnectionSchema,
  VastError,
  type MetaResponse,
} from '@vast/shared';
import {
  buildSshTunnelConfigFromParts,
  ConnectionManager,
  isLikelyMongoUri,
} from '@vast/mongo-core';
import type { AppContext } from './app-context.js';
import {
  authMiddleware,
  clearSessionCookie,
  createSession,
  setSessionCookie,
  verifyPassword,
  destroySession,
} from './auth.js';
import { getCookie } from 'hono/cookie';
import { mongoRoutes } from './routes/mongo.js';

export type { AppContext };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export function createApp(ctx: AppContext) {
  const app = new Hono();
  const { config, log, connections, store } = ctx;

  app.use('*', honoLogger());
  app.use(
    '*',
    cors({
      origin: (origin) => origin || '*',
      credentials: true,
    }),
  );
  app.use('*', authMiddleware(config));

  app.onError((err, c) => {
    if (err instanceof VastError) {
      return c.json(err.toJSON(), err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: ErrorCode.VALIDATION,
            message: 'Invalid request',
            details: err.flatten(),
          },
        },
        400,
      );
    }
    log.error({ err }, 'Unhandled error');
    const message = err instanceof Error ? err.message : 'Internal server error';
    // Don't leak internals in production-ish
    return c.json(
      {
        error: {
          code: ErrorCode.MONGO,
          message: message.slice(0, 500),
        },
      },
      500,
    );
  });

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok' as const,
      uptimeSec: Math.floor((Date.now() - ctx.startedAt) / 1000),
    });
  });

  app.get('/api/v1/meta', (c) => {
    const body: MetaResponse = {
      name: 'vast',
      version: config.version,
      runtime: config.runtime,
      authMode: config.authMode,
      features: {
        dumpTools: false,
        oidc: config.authMode === 'oidc',
      },
    };
    return c.json(body);
  });

  app.post('/api/v1/auth/login', async (c) => {
    if (config.authMode === 'none') {
      return c.json({ data: { ok: true, authMode: 'none' } });
    }
    const body = LoginBodySchema.parse(await c.req.json());
    if (!verifyPassword(config, body.password)) {
      throw new VastError(ErrorCode.UNAUTHORIZED, 'Invalid password');
    }
    const token = createSession();
    setSessionCookie(c, token, config.runtime === 'web' && process.env.NODE_ENV === 'production');
    return c.json({ data: { ok: true } });
  });

  app.post('/api/v1/auth/logout', (c) => {
    destroySession(getCookie(c, 'vast_session'));
    clearSessionCookie(c);
    return c.json({ data: { ok: true } });
  });

  app.get('/api/v1/auth/me', (c) => {
    return c.json({
      data: {
        authMode: config.authMode,
        authenticated: config.authMode === 'none' ? true : !!getCookie(c, 'vast_session'),
      },
    });
  });

  // --- Connections ---
  app.get('/api/v1/connections', (c) => {
    const connected = new Set(connections.listConnectedIds());
    const list = store.list().map((conn) => ({
      ...conn,
      status: connected.has(conn.id) ? ('connected' as const) : conn.status,
    }));
    return c.json({ data: list });
  });

  app.post('/api/v1/connections', async (c) => {
    const body = CreateConnectionSchema.parse(await c.req.json());
    if (!isLikelyMongoUri(body.uri)) {
      throw new VastError(ErrorCode.VALIDATION, 'URI must start with mongodb:// or mongodb+srv://');
    }
    const created = store.create(body);
    return c.json({ data: created }, 201);
  });

  app.get('/api/v1/connections/:id', (c) => {
    const id = c.req.param('id');
    const stored = store.get(id);
    if (!stored) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    const status = connections.get(id) ? 'connected' : 'disconnected';
    return c.json({ data: store.toPublic(stored, status) });
  });

  app.patch('/api/v1/connections/:id', async (c) => {
    const id = c.req.param('id');
    const body = UpdateConnectionSchema.parse(await c.req.json());
    if (body.uri !== undefined && !isLikelyMongoUri(body.uri)) {
      throw new VastError(ErrorCode.VALIDATION, 'URI must start with mongodb:// or mongodb+srv://');
    }
    const updated = store.update(id, body);
    if (!updated) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    if (
      connections.get(id) &&
      (body.uri !== undefined || body.readOnly !== undefined || body.ssh !== undefined)
    ) {
      const uri = store.getUri(id)!;
      const stored = store.get(id)!;
      const sshDec = store.getSsh(id);
      const ssh = sshDec ? buildSshTunnelConfigFromParts(sshDec, uri) : undefined;
      await connections.connect(id, uri, {
        readOnly: stored.readOnly || config.readOnly,
        ssh,
      });
    }
    const status = connections.get(id) ? 'connected' : 'disconnected';
    const stored = store.get(id)!;
    return c.json({ data: store.toPublic(stored, status) });
  });

  app.delete('/api/v1/connections/:id', async (c) => {
    const id = c.req.param('id');
    await connections.disconnect(id);
    const ok = store.delete(id);
    if (!ok) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    return c.json({ ok: true });
  });

  app.post('/api/v1/connections/test', async (c) => {
    const body = TestConnectionSchema.parse(await c.req.json());
    if (!isLikelyMongoUri(body.uri)) {
      throw new VastError(ErrorCode.VALIDATION, 'URI must start with mongodb:// or mongodb+srv://');
    }
    const ssh =
      body.ssh?.enabled
        ? buildSshTunnelConfigFromParts(
            {
              enabled: true,
              host: body.ssh.host,
              port: body.ssh.port,
              username: body.ssh.username,
              authMethod: body.ssh.authMethod,
              password: body.ssh.password,
              privateKey: body.ssh.privateKey,
              passphrase: body.ssh.passphrase,
              destinationHost: body.ssh.destinationHost,
              destinationPort: body.ssh.destinationPort,
            },
            body.uri,
          )
        : undefined;
    const result = await connections.test(body.uri, { ssh });
    return c.json({ data: result });
  });

  app.post('/api/v1/connections/:id/test', async (c) => {
    const id = c.req.param('id');
    const uri = store.getUri(id);
    if (!uri) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    const sshDec = store.getSsh(id);
    const ssh = sshDec ? buildSshTunnelConfigFromParts(sshDec, uri) : undefined;
    const result = await connections.test(uri, { ssh });
    return c.json({ data: result });
  });

  app.post('/api/v1/connections/:id/connect', async (c) => {
    const id = c.req.param('id');
    const stored = store.get(id);
    const uri = store.getUri(id);
    if (!stored || !uri) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    try {
      const sshDec = store.getSsh(id);
      const ssh = sshDec ? buildSshTunnelConfigFromParts(sshDec, uri) : undefined;
      await connections.connect(id, uri, {
        readOnly: stored.readOnly || config.readOnly,
        ssh,
      });
      store.touch(id);
      return c.json({ data: store.toPublic(stored, 'connected') });
    } catch (err) {
      const message = err instanceof VastError ? err.message : 'Connection failed';
      return c.json({ data: store.toPublic(stored, 'error', message) }, 502);
    }
  });

  app.post('/api/v1/connections/:id/disconnect', async (c) => {
    const id = c.req.param('id');
    const stored = store.get(id);
    if (!stored) throw new VastError(ErrorCode.NOT_FOUND, 'Connection not found');
    await connections.disconnect(id);
    return c.json({ data: store.toPublic(stored, 'disconnected') });
  });

  app.route('/api/v1', mongoRoutes(ctx));

  // --- Static SPA ---
  if (config.webDistDir && existsSync(config.webDistDir)) {
    app.get('*', async (c) => {
      const url = new URL(c.req.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const filePath = join(config.webDistDir!, rel);
      if (!filePath.startsWith(config.webDistDir!)) {
        return c.text('Not found', 404);
      }
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        const body = readFileSync(filePath);
        return c.body(body, 200, {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
        });
      }
      const indexPath = join(config.webDistDir!, 'index.html');
      if (existsSync(indexPath)) {
        return c.html(readFileSync(indexPath, 'utf8'));
      }
      return c.text('Not found', 404);
    });
  } else {
    app.get('/', (c) =>
      c.json({
        name: 'vast',
        message: 'API is running. Start the web dev server or set VAST_WEB_DIST.',
        health: '/api/health',
        meta: '/api/v1/meta',
      }),
    );
  }

  return app;
}

// re-export for tests that construct ConnectionManager
export { ConnectionManager };
