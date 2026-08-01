import { MongoClient, type MongoClientOptions } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';
import { maskMongoUri } from './uri.js';

export interface ManagedConnection {
  id: string;
  uri: string;
  readOnly: boolean;
  client: MongoClient;
  connectedAt: Date;
}

export interface TestConnectionOptions {
  serverSelectionTimeoutMS?: number;
}

export class ConnectionManager {
  private readonly clients = new Map<string, ManagedConnection>();

  async test(uri: string, options: TestConnectionOptions = {}): Promise<{
    ok: boolean;
    message: string;
    serverVersion?: string;
    host?: string;
  }> {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5000,
    });
    try {
      await client.connect();
      const info = await client.db('admin').command({ buildInfo: 1 });
      const hello = await client.db('admin').command({ hello: 1 }).catch(() => null);
      return {
        ok: true,
        message: 'Connected successfully',
        serverVersion: typeof info.version === 'string' ? info.version : undefined,
        host: hello && typeof hello.me === 'string' ? hello.me : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? sanitizeMongoError(err.message) : 'Connection failed';
      return { ok: false, message };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async connect(
    id: string,
    uri: string,
    options: { readOnly?: boolean; mongoOptions?: MongoClientOptions } = {},
  ): Promise<ManagedConnection> {
    await this.disconnect(id);
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      ...options.mongoOptions,
    });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
    } catch (err) {
      await client.close().catch(() => undefined);
      throw new VastError(ErrorCode.CONNECTION_FAILED, sanitizeMongoError(
        err instanceof Error ? err.message : 'Failed to connect',
      ));
    }
    const managed: ManagedConnection = {
      id,
      uri,
      readOnly: options.readOnly ?? false,
      client,
      connectedAt: new Date(),
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
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.clients.keys()];
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  listConnectedIds(): string[] {
    return [...this.clients.keys()];
  }
}

function sanitizeMongoError(message: string): string {
  // Strip credential-looking segments if the driver echoes a URI.
  return maskMongoUri(message)
    .replace(/password[=:]\S+/gi, 'password=***')
    .slice(0, 500);
}
