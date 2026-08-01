import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ConnectionPublic,
  CreateConnectionInput,
  SshConfigInput,
  SshPublic,
  UpdateConnectionInput,
} from '@vast/shared';
import { encryptString, decryptString, maskMongoUri } from '@vast/mongo-core';

interface StoredSsh {
  enabled: boolean;
  host?: string;
  port?: number;
  username?: string;
  authMethod?: 'password' | 'privateKey';
  passwordEncrypted?: string;
  privateKeyEncrypted?: string;
  passphraseEncrypted?: string;
  destinationHost?: string;
  destinationPort?: number;
}

interface StoredConnection {
  id: string;
  name: string;
  color: ConnectionPublic['color'];
  notes?: string;
  readOnly: boolean;
  defaultDatabase?: string;
  uriEncrypted: string;
  ssh?: StoredSsh;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface StoreFile {
  version: 2;
  connections: StoredConnection[];
}

export interface DecryptedSsh {
  enabled: boolean;
  host?: string;
  port: number;
  username?: string;
  authMethod: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  destinationHost?: string;
  destinationPort?: number;
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
      return { version: 2, connections: [] };
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as {
        version?: number;
        connections: StoredConnection[];
      };
      return { version: 2, connections: raw.connections ?? [] };
    } catch {
      return { version: 2, connections: [] };
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

  getSsh(id: string): DecryptedSsh | undefined {
    const c = this.get(id);
    if (!c?.ssh) return undefined;
    return this.decryptSsh(c.ssh);
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
      ssh: this.encryptSshInput(input.ssh),
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
      ssh:
        input.ssh !== undefined
          ? this.mergeSsh(existing.ssh, input.ssh)
          : existing.ssh,
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
      ssh: this.toSshPublic(c.ssh),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastUsedAt: c.lastUsedAt,
      status,
      lastError,
    };
  }

  private encryptSshInput(ssh?: SshConfigInput): StoredSsh | undefined {
    if (!ssh) return undefined;
    const stored: StoredSsh = {
      enabled: ssh.enabled ?? false,
      host: ssh.host,
      port: ssh.port ?? 22,
      username: ssh.username,
      authMethod: ssh.authMethod ?? 'password',
      destinationHost: ssh.destinationHost,
      destinationPort: ssh.destinationPort,
    };
    if (ssh.password) {
      stored.passwordEncrypted = encryptString(ssh.password, this.secretKey);
    }
    if (ssh.privateKey) {
      stored.privateKeyEncrypted = encryptString(ssh.privateKey, this.secretKey);
    }
    if (ssh.passphrase) {
      stored.passphraseEncrypted = encryptString(ssh.passphrase, this.secretKey);
    }
    return stored;
  }

  private mergeSsh(existing: StoredSsh | undefined, input: SshConfigInput): StoredSsh {
    const base: StoredSsh = {
      enabled: input.enabled ?? existing?.enabled ?? false,
      host: input.host ?? existing?.host,
      port: input.port ?? existing?.port ?? 22,
      username: input.username ?? existing?.username,
      authMethod: input.authMethod ?? existing?.authMethod ?? 'password',
      passwordEncrypted: existing?.passwordEncrypted,
      privateKeyEncrypted: existing?.privateKeyEncrypted,
      passphraseEncrypted: existing?.passphraseEncrypted,
      destinationHost: input.destinationHost ?? existing?.destinationHost,
      destinationPort: input.destinationPort ?? existing?.destinationPort,
    };
    if (input.password !== undefined && input.password !== '') {
      base.passwordEncrypted = encryptString(input.password, this.secretKey);
    }
    if (input.privateKey !== undefined && input.privateKey !== '') {
      base.privateKeyEncrypted = encryptString(input.privateKey, this.secretKey);
    }
    if (input.passphrase !== undefined && input.passphrase !== '') {
      base.passphraseEncrypted = encryptString(input.passphrase, this.secretKey);
    }
    // Explicit empty string can clear passphrase only if needed — leave as-is
    return base;
  }

  private decryptSsh(ssh: StoredSsh): DecryptedSsh {
    return {
      enabled: ssh.enabled,
      host: ssh.host,
      port: ssh.port ?? 22,
      username: ssh.username,
      authMethod: ssh.authMethod ?? 'password',
      password: ssh.passwordEncrypted
        ? decryptString(ssh.passwordEncrypted, this.secretKey)
        : undefined,
      privateKey: ssh.privateKeyEncrypted
        ? decryptString(ssh.privateKeyEncrypted, this.secretKey)
        : undefined,
      passphrase: ssh.passphraseEncrypted
        ? decryptString(ssh.passphraseEncrypted, this.secretKey)
        : undefined,
      destinationHost: ssh.destinationHost,
      destinationPort: ssh.destinationPort,
    };
  }

  private toSshPublic(ssh?: StoredSsh): SshPublic | undefined {
    if (!ssh) return undefined;
    return {
      enabled: ssh.enabled,
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      authMethod: ssh.authMethod,
      hasPassword: Boolean(ssh.passwordEncrypted),
      hasPrivateKey: Boolean(ssh.privateKeyEncrypted),
      hasPassphrase: Boolean(ssh.passphraseEncrypted),
      destinationHost: ssh.destinationHost,
      destinationPort: ssh.destinationPort,
    };
  }
}
