import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionPublic, CreateConnectionInput, UpdateConnectionInput } from '@vast/shared';
import { encryptString, decryptString, maskMongoUri } from '@vast/mongo-core';

interface StoredConnection {
  id: string;
  name: string;
  color: ConnectionPublic['color'];
  notes?: string;
  readOnly: boolean;
  defaultDatabase?: string;
  uriEncrypted: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface StoreFile {
  version: 1;
  connections: StoredConnection[];
}

export class ConnectionStore {
  private readonly filePath: string;
  private data: StoreFile;

  constructor(
    dataDir: string,
    private readonly secretKey: string,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'connections.json');
    this.data = this.load();
  }

  private load(): StoreFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, connections: [] };
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoreFile;
      return raw.version === 1 ? raw : { version: 1, connections: [] };
    } catch {
      return { version: 1, connections: [] };
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  list(): ConnectionPublic[] {
    return this.data.connections.map((c) => this.toPublic(c, 'disconnected'));
  }

  get(id: string): StoredConnection | undefined {
    return this.data.connections.find((c) => c.id === id);
  }

  getUri(id: string): string | undefined {
    const c = this.get(id);
    if (!c) return undefined;
    return decryptString(c.uriEncrypted, this.secretKey);
  }

  create(input: CreateConnectionInput): ConnectionPublic {
    const now = new Date().toISOString();
    const stored: StoredConnection = {
      id: randomUUID(),
      name: input.name,
      color: input.color ?? 'teal',
      notes: input.notes,
      readOnly: input.readOnly ?? false,
      defaultDatabase: input.defaultDatabase,
      uriEncrypted: encryptString(input.uri, this.secretKey),
      createdAt: now,
      updatedAt: now,
    };
    this.data.connections.push(stored);
    this.save();
    return this.toPublic(stored, 'disconnected');
  }

  update(id: string, input: UpdateConnectionInput): ConnectionPublic | undefined {
    const idx = this.data.connections.findIndex((c) => c.id === id);
    if (idx < 0) return undefined;
    const existing = this.data.connections[idx]!;
    const updated: StoredConnection = {
      ...existing,
      name: input.name ?? existing.name,
      color: input.color ?? existing.color,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      readOnly: input.readOnly ?? existing.readOnly,
      defaultDatabase:
        input.defaultDatabase !== undefined ? input.defaultDatabase : existing.defaultDatabase,
      uriEncrypted:
        input.uri !== undefined
          ? encryptString(input.uri, this.secretKey)
          : existing.uriEncrypted,
      updatedAt: new Date().toISOString(),
    };
    this.data.connections[idx] = updated;
    this.save();
    return this.toPublic(updated, 'disconnected');
  }

  delete(id: string): boolean {
    const before = this.data.connections.length;
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    if (this.data.connections.length === before) return false;
    this.save();
    return true;
  }

  touch(id: string): void {
    const c = this.get(id);
    if (!c) return;
    c.lastUsedAt = new Date().toISOString();
    this.save();
  }

  toPublic(
    c: StoredConnection,
    status: ConnectionPublic['status'],
    lastError?: string,
  ): ConnectionPublic {
    let uriDisplay = '***';
    try {
      uriDisplay = maskMongoUri(decryptString(c.uriEncrypted, this.secretKey));
    } catch {
      uriDisplay = '***';
    }
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      notes: c.notes,
      readOnly: c.readOnly,
      defaultDatabase: c.defaultDatabase,
      uriDisplay,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastUsedAt: c.lastUsedAt,
      status,
      lastError,
    };
  }
}
