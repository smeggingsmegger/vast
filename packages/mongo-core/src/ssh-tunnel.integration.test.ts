/**
 * Real SSH tunnel → Mongo when vast-ssh + vast-mongo-test are running.
 * Skip cleanly if port 2222 is unavailable.
 */
import { describe, expect, it } from 'vitest';
import { ConnectionManager } from './connection-manager.js';
import { openSshTunnel, rewriteUriToLocalTunnel } from './ssh-tunnel.js';
import { MongoClient } from 'mongodb';
import { createConnection } from 'node:net';

async function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host, port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(1500, () => {
      s.destroy();
      resolve(false);
    });
  });
}

const SSH_HOST = process.env.VAST_TEST_SSH_HOST ?? '127.0.0.1';
const SSH_PORT = Number(process.env.VAST_TEST_SSH_PORT ?? 2222);
const SSH_USER = process.env.VAST_TEST_SSH_USER ?? 'sshuser';
const SSH_PASS = process.env.VAST_TEST_SSH_PASS ?? 'testssh';
const MONGO_DEST_HOST = process.env.VAST_TEST_SSH_MONGO_HOST ?? 'vast-mongo-test';
const MONGO_DEST_PORT = Number(process.env.VAST_TEST_SSH_MONGO_PORT ?? 27017);

const available = await portOpen(SSH_HOST, SSH_PORT);

describe.skipIf(!available)('SSH tunnel → Mongo (real)', () => {
  it(
    'forwards and pings Mongo through SSH password auth',
    async () => {
    const tunnel = await openSshTunnel({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      authMethod: 'password',
      password: SSH_PASS,
      destinationHost: MONGO_DEST_HOST,
      destinationPort: MONGO_DEST_PORT,
    });
    try {
      const uri = rewriteUriToLocalTunnel(
        `mongodb://${MONGO_DEST_HOST}:${MONGO_DEST_PORT}`,
        tunnel.localHost,
        tunnel.localPort,
      );
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 8000,
        directConnection: true,
      });
      await client.connect();
      const ping = await client.db('admin').command({ ping: 1 });
      expect(ping.ok).toBe(1);
      await client.close();
    } finally {
      await tunnel.close();
    }
  },
    30_000,
  );

  it(
    'ConnectionManager.test succeeds via SSH',
    async () => {
    const mgr = new ConnectionManager();
    const result = await mgr.test('mongodb://vast-mongo-test:27017', {
      ssh: {
        host: SSH_HOST,
        port: SSH_PORT,
        username: SSH_USER,
        authMethod: 'password',
        password: SSH_PASS,
        destinationHost: MONGO_DEST_HOST,
        destinationPort: MONGO_DEST_PORT,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.viaSsh).toBe(true);
    expect(result.serverVersion).toBeTruthy();
  },
    30_000,
  );
});
