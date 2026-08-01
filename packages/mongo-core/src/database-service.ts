import type { Db, MongoClient } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';

export interface DatabaseInfo {
  name: string;
  sizeOnDisk?: number;
  empty?: boolean;
}

export class DatabaseService {
  constructor(private readonly client: MongoClient) {}

  async list(): Promise<DatabaseInfo[]> {
    const result = await this.client.db().admin().listDatabases();
    return (result.databases ?? []).map((d) => ({
      name: d.name,
      sizeOnDisk: d.sizeOnDisk,
      empty: d.empty,
    }));
  }

  async create(name: string): Promise<void> {
    assertDbName(name);
    const db = this.client.db(name);
    // Creating a collection materializes the database. Keep a marker collection —
    // fully empty DBs are omitted from listDatabases.
    const existing = await db.listCollections({ name: '_vast' }, { nameOnly: true }).hasNext();
    if (!existing) {
      await db.createCollection('_vast');
    }
  }

  async drop(name: string): Promise<void> {
    assertDbName(name);
    if (['admin', 'local', 'config'].includes(name)) {
      throw new VastError(ErrorCode.FORBIDDEN, `Cannot drop system database: ${name}`);
    }
    await this.client.db(name).dropDatabase();
  }

  async stats(name: string): Promise<Record<string, unknown>> {
    assertDbName(name);
    const stats = await this.client.db(name).stats();
    return stats as unknown as Record<string, unknown>;
  }

  db(name: string): Db {
    assertDbName(name);
    return this.client.db(name);
  }
}

function assertDbName(name: string): void {
  if (!name || name.length > 64 || /[/\0.$" ]/.test(name)) {
    throw new VastError(ErrorCode.VALIDATION, `Invalid database name: ${name}`);
  }
}
