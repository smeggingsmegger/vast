import { MongoClient, type MongoClientOptions } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';
import { maskMongoUri } from './uri.js';
import {
  openSshTunnel,
  parseMongoHostPort,
  rewriteUriToLocalTunnel,
  type SshTunnelConfig,
  type SshTunnelHandle,
} from './ssh-tunnel.js';

export interface ManagedConnection {
  id: string;
  uri: string;
  readOnly: boolean;
  client: MongoClient;
  connectedAt: Date;
  tunnel?: SshTunnelHandle;
  viaSsh: boolean;
}

export interface TestConnectionOptions {
  serverSelectionTimeoutMS?: number;
  ssh?: SshTunnelConfig;
}

export class ConnectionManager {
  private readonly clients = new Map<string, ManagedConnection>();

  async test(
    uri: string,
    options: TestConnectionOptions = {},
  ): Promise<{
    ok: boolean;
    message: string;
    serverVersion?: string;
    host?: string;
    viaSsh?: boolean;
  }> {
    let tunnel: SshTunnelHandle | undefined;
    let effectiveUri = uri;
    try {
      if (options.ssh) {
        tunnel = await openSshTunnel(options.ssh);
        effectiveUri = rewriteUriToLocalTunnel(uri, tunnel.localHost, tunnel.localPort);
      }
      const client = new MongoClient(effectiveUri, {
        serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 8000,
        directConnection: Boolean(options.ssh),
      });
      try {
        await client.connect();
        const info = await client.db('admin').command({ buildInfo: 1 });
        const hello = await client.db('admin').command({ hello: 1 }).catch(() => null);
        return {
          ok: true,
          message: options.ssh
            ? 'Connected successfully via SSH tunnel'
            : 'Connected successfully',
          serverVersion: typeof info.version === 'string' ? info.version : undefined,
          host: hello && typeof hello.me === 'string' ? hello.me : undefined,
          viaSsh: Boolean(options.ssh),
        };
      } finally {
        await client.close().catch(() => undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? sanitizeMongoError(err.message) : 'Connection failed';
      return { ok: false, message, viaSsh: Boolean(options.ssh) };
    } finally {
      if (tunnel) await tunnel.close().catch(() => undefined);
    }
  }

  async connect(
    id: string,
    uri: string,
    options: {
      readOnly?: boolean;
      mongoOptions?: MongoClientOptions;
      ssh?: SshTunnelConfig;
    } = {},
  ): Promise<ManagedConnection> {
    await this.disconnect(id);

    let tunnel: SshTunnelHandle | undefined;
    let effectiveUri = uri;
    if (options.ssh) {
      tunnel = await openSshTunnel(options.ssh);
      effectiveUri = rewriteUriToLocalTunnel(uri, tunnel.localHost, tunnel.localPort);
    }

    const client = new MongoClient(effectiveUri, {
      serverSelectionTimeoutMS: 12_000,
      directConnection: Boolean(options.ssh),
      ...options.mongoOptions,
    });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
    } catch (err) {
      await client.close().catch(() => undefined);
      if (tunnel) await tunnel.close().catch(() => undefined);
      throw new VastError(
        ErrorCode.CONNECTION_FAILED,
        sanitizeMongoError(err instanceof Error ? err.message : 'Failed to connect'),
      );
    }
    const managed: ManagedConnection = {
      id,
      uri,
      readOnly: options.readOnly ?? false,
      client,
      connectedAt: new Date(),
      tunnel,
      viaSsh: Boolean(options.ssh),
    };
    this.clients.set(id, managed);
    return managed;
  }

  get(id: string): ManagedConnection | undefined {
    return this.clients.get(id);
  }

  require(id: string): ManagedConnection {
    const managed = this.clients.get(id);
    if (!managed) {
      throw new VastError(ErrorCode.NOT_FOUND, `Connection ${id} is not connected`);
    }
    return managed;
  }

  assertWritable(id: string): ManagedConnection {
    const managed = this.require(id);
    if (managed.readOnly) {
      throw new VastError(ErrorCode.READ_ONLY, 'Connection is read-only');
    }
    return managed;
  }

  async disconnect(id: string): Promise<void> {
    const managed = this.clients.get(id);
    if (!managed) return;
    this.clients.delete(id);
    await managed.client.close().catch(() => undefined);
    if (managed.tunnel) await managed.tunnel.close().catch(() => undefined);
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.clients.keys()];
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  listConnectedIds(): string[] {
    return [...this.clients.keys()];
  }
}

export function buildSshTunnelConfigFromParts(
  ssh: {
    enabled: boolean;
    host?: string;
    port?: number;
    username?: string;
    authMethod?: 'password' | 'privateKey';
    password?: string;
    privateKey?: string;
    passphrase?: string;
    destinationHost?: string;
    destinationPort?: number;
  },
  mongoUri: string,
): SshTunnelConfig | undefined {
  if (!ssh.enabled) return undefined;
  if (!ssh.host || !ssh.username) {
    throw new VastError(ErrorCode.VALIDATION, 'SSH host and username are required');
  }
  let destHost = ssh.destinationHost;
  let destPort = ssh.destinationPort;
  if (!destHost || !destPort) {
    const parsed = parseMongoHostPort(mongoUri);
    destHost = destHost ?? parsed.host;
    destPort = destPort ?? parsed.port;
  }
  return {
    host: ssh.host,
    port: ssh.port ?? 22,
    username: ssh.username,
    authMethod: ssh.authMethod ?? 'password',
    password: ssh.password,
    privateKey: ssh.privateKey,
    passphrase: ssh.passphrase,
    destinationHost: destHost,
    destinationPort: destPort,
  };
}

function sanitizeMongoError(message: string): string {
  return maskMongoUri(message)
    .replace(/password[=:]\S+/gi, 'password=***')
    .slice(0, 500);
}
