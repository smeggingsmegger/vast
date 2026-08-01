import type { Collection, Document, IndexDescription, CreateIndexesOptions } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';
import { toEJSON } from './ejson.js';

export class IndexService {
  constructor(private readonly collection: Collection<Document>) {}

  async list(): Promise<unknown[]> {
    const indexes = await this.collection.indexes();
    return indexes.map((i) => toEJSON(i));
  }

  async create(
    keysEjson: Record<string, 1 | -1 | 'text' | '2dsphere' | 'hashed' | string | number>,
    options: CreateIndexesOptions & { name?: string } = {},
  ): Promise<string> {
    // Index keys are plain direction specs — do not EJSON-deserialize (numbers stay numbers).
    const keys = keysEjson as IndexDescription['key'];
    if (!keys || !Object.keys(keys as object).length) {
      throw new VastError(ErrorCode.VALIDATION, 'Index keys required');
    }
    try {
      return await this.collection.createIndex(keys as Document, options);
    } catch (err) {
      throw new VastError(
        ErrorCode.MONGO,
        err instanceof Error ? err.message : 'Failed to create index',
        { cause: err },
      );
    }
  }

  async drop(name: string): Promise<void> {
    if (!name || name === '_id_') {
      throw new VastError(ErrorCode.FORBIDDEN, 'Cannot drop the _id_ index');
    }
    await this.collection.dropIndex(name);
  }
}
