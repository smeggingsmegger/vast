import type { CreateCollectionOptions, Db } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';

export interface CollectionInfo {
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

export class CollectionService {
  constructor(private readonly db: Db) {}

  async list(): Promise<CollectionInfo[]> {
    const cols = await this.db.listCollections().toArray();
    return cols.map((c) => {
      const info = c as { name: string; type?: string; options?: Record<string, unknown> };
      return {
        name: info.name,
        type: info.type ?? 'collection',
        options: info.options,
      };
    });
  }

  async create(name: string, options?: CreateCollectionOptions): Promise<void> {
    assertColName(name);
    await this.db.createCollection(name, options);
  }

  async drop(name: string): Promise<void> {
    assertColName(name);
    const exists = await this.db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (!exists) throw new VastError(ErrorCode.NOT_FOUND, `Collection not found: ${name}`);
    await this.db.collection(name).drop();
  }

  async rename(from: string, to: string): Promise<void> {
    assertColName(from);
    assertColName(to);
    await this.db.collection(from).rename(to);
  }

  async stats(name: string): Promise<Record<string, unknown>> {
    assertColName(name);
    try {
      const stats = await this.db.command({ collStats: name });
      return stats as Record<string, unknown>;
    } catch (err) {
      throw new VastError(
        ErrorCode.MONGO,
        err instanceof Error ? err.message : 'Failed to get collection stats',
      );
    }
  }

  async estimatedCount(name: string): Promise<number> {
    assertColName(name);
    return this.db.collection(name).estimatedDocumentCount();
  }
}

function assertColName(name: string): void {
  if (!name || name.includes('\0') || name.startsWith('system.')) {
    throw new VastError(ErrorCode.VALIDATION, `Invalid collection name: ${name}`);
  }
}
