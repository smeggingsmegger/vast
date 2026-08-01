import { serve } from '@hono/node-server';
import { ConnectionManager } from '@vast/mongo-core';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';
import { ConnectionStore } from './store/connection-store.js';
import { JobService } from './jobs.js';

const config = loadConfig();
const log = createLogger(config.logLevel);
const connections = new ConnectionManager();
const store = new ConnectionStore(config.dataDir, config.secretKey);
const jobs = new JobService(config.dataDir);

const app = createApp({
  config,
  log,
  connections,
  store,
  jobs,
  startedAt: Date.now(),
});

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.bind,
    port: config.port,
  },
  (info) => {
    log.info(
      {
        bind: config.bind,
        port: info.port,
        runtime: config.runtime,
        authMode: config.authMode,
        dataDir: config.dataDir,
        webDist: config.webDistDir ?? null,
      },
      `Vast server listening on http://${config.bind}:${info.port}`,
    );
  },
);

async function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down');
  await connections.disconnectAll();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
