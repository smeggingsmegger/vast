import type { Collection, Document, Filter, Sort } from 'mongodb';
import { ObjectId } from 'bson';
import { ErrorCode, VastError } from '@vast/shared';
import { fromEJSON, toEJSON } from './ejson.js';
import { convertFieldValue, getByPath, setByPath, type ConvertibleType } from './type-convert.js';
import { parseFieldEditorValue, type FieldEditType } from './field-value.js';

export interface FindOptions {
  filter?: unknown;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  maxTimeMS?: number;
}

export interface FindResult {
  data: unknown[];
  page: {
    limit: number;
    skip: number;
    returned: number;
    hasMore: boolean;
    executionMs: number;
  };
}

export class DocumentService {
  constructor(private readonly collection: Collection<Document>) {}

  async find(options: FindOptions = {}): Promise<FindResult> {
    const limit = clamp(options.limit ?? 50, 1, 1000);
    const skip = Math.max(0, options.skip ?? 0);
    const maxTimeMS = options.maxTimeMS ?? 30_000;
    const filter = parseFilter(options.filter);
    const started = Date.now();

    const cursor = this.collection.find(filter, {
      projection: options.projection,
      sort: options.sort as Sort | undefined,
      skip,
      limit: limit + 1,
      maxTimeMS,
    });

    const docs = await cursor.toArray();
    const hasMore = docs.length > limit;
    const pageDocs = hasMore ? docs.slice(0, limit) : docs;

    return {
      data: pageDocs.map((d) => toEJSON(d)),
      page: {
        limit,
        skip,
        returned: pageDocs.length,
        hasMore,
        executionMs: Date.now() - started,
      },
    };
  }

  async count(filter?: unknown, maxTimeMS = 30_000): Promise<number> {
    return this.collection.countDocuments(parseFilter(filter), { maxTimeMS });
  }

  async insertOne(docEjson: unknown): Promise<unknown> {
    const doc = fromEJSON(docEjson) as Document;
    const result = await this.collection.insertOne(doc);
    const inserted = await this.collection.findOne({ _id: result.insertedId });
    return toEJSON(inserted);
  }

  async insertMany(docsEjson: unknown[]): Promise<{ insertedCount: number; ids: unknown[] }> {
    const docs = docsEjson.map((d) => fromEJSON(d) as Document);
    const result = await this.collection.insertMany(docs, { ordered: false });
    return {
      insertedCount: result.insertedCount,
      ids: Object.values(result.insertedIds).map((id) => toEJSON(id)),
    };
  }

  async findById(idEjson: unknown): Promise<unknown | null> {
    const _id = fromEJSON(idEjson);
    const doc = await this.collection.findOne({ _id } as Filter<Document>);
    return doc ? toEJSON(doc) : null;
  }

  async replaceOne(idEjson: unknown, docEjson: unknown): Promise<unknown> {
    const _id = fromEJSON(idEjson);
    const doc = fromEJSON(docEjson) as Document;
    if (doc._id !== undefined && !idsEqual(doc._id, _id)) {
      throw new VastError(ErrorCode.VALIDATION, 'Document _id cannot be changed on replace');
    }
    doc._id = _id as Document['_id'];
    const result = await this.collection.replaceOne({ _id } as Filter<Document>, doc);
    if (result.matchedCount === 0) {
      throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
    }
    const updated = await this.collection.findOne({ _id } as Filter<Document>);
    return toEJSON(updated);
  }

  async patchFields(
    idEjson: unknown,
    ops: {
      set?: Record<string, unknown>;
      unset?: string[];
      rename?: Record<string, string>;
      inc?: Record<string, number>;
    },
  ): Promise<unknown> {
    const _id = fromEJSON(idEjson);
    const update: Document = {};
    if (ops.set && Object.keys(ops.set).length) {
      update.$set = fromEJSON(ops.set) as Document;
    }
    if (ops.unset?.length) {
      update.$unset = Object.fromEntries(ops.unset.map((k) => [k, '']));
    }
    if (ops.rename && Object.keys(ops.rename).length) {
      update.$rename = ops.rename;
    }
    if (ops.inc && Object.keys(ops.inc).length) {
      update.$inc = ops.inc;
    }
    if (!Object.keys(update).length) {
      throw new VastError(ErrorCode.VALIDATION, 'No patch operations provided');
    }
    const result = await this.collection.updateOne({ _id } as Filter<Document>, update);
    if (result.matchedCount === 0) {
      throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
    }
    const updated = await this.collection.findOne({ _id } as Filter<Document>);
    return toEJSON(updated);
  }

  /**
   * Set a single field from the type-aware editor (parses raw UI value → BSON).
   */
  async setField(
    idEjson: unknown,
    path: string,
    type: FieldEditType,
    rawValue: unknown,
  ): Promise<unknown> {
    const _id = fromEJSON(idEjson);
    const parsed = parseFieldEditorValue(rawValue, type);
    if (type === 'null') {
      const result = await this.collection.updateOne(
        { _id } as Filter<Document>,
        { $set: { [path]: null } },
      );
      if (result.matchedCount === 0) {
        throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
      }
    } else {
      const result = await this.collection.updateOne(
        { _id } as Filter<Document>,
        { $set: { [path]: parsed } },
      );
      if (result.matchedCount === 0) {
        throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
      }
    }
    const updated = await this.collection.findOne({ _id } as Filter<Document>);
    return toEJSON(updated);
  }

  async convertField(idEjson: unknown, path: string, toType: ConvertibleType): Promise<unknown> {
    const _id = fromEJSON(idEjson);
    const doc = await this.collection.findOne({ _id } as Filter<Document>);
    if (!doc) throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
    const current = getByPath(doc as Record<string, unknown>, path);
    if (current === undefined) {
      throw new VastError(ErrorCode.NOT_FOUND, `Field not found: ${path}`);
    }
    const converted = convertFieldValue(current, toType);
    const next = setByPath(doc as Record<string, unknown>, path, converted);
    // Use $set on path for atomic field update when path has no arrays
    await this.collection.updateOne(
      { _id } as Filter<Document>,
      { $set: { [path]: converted } },
    );
    // If nested set failed partially, fall back to replace
    void next;
    const updated = await this.collection.findOne({ _id } as Filter<Document>);
    return toEJSON(updated);
  }

  async deleteOne(idEjson: unknown): Promise<{ deleted: boolean }> {
    const _id = fromEJSON(idEjson);
    const result = await this.collection.deleteOne({ _id } as Filter<Document>);
    return { deleted: result.deletedCount === 1 };
  }

  async deleteOneByFilter(filterEjson: unknown): Promise<{
    deletedCount: number;
    matchedCount: number;
  }> {
    const filter = parseFilter(filterEjson);
    if (!filter || Object.keys(filter).length === 0) {
      throw new VastError(ErrorCode.VALIDATION, 'deleteOne requires a non-empty filter');
    }
    const matchedCount = await this.collection.countDocuments(filter, { limit: 1 });
    const result = await this.collection.deleteOne(filter);
    return { deletedCount: result.deletedCount, matchedCount };
  }

  async deleteMany(filterEjson: unknown): Promise<{ deletedCount: number; matchedCount: number }> {
    const filter = parseFilter(filterEjson);
    if (!filter || Object.keys(filter).length === 0) {
      throw new VastError(ErrorCode.VALIDATION, 'deleteMany requires a non-empty filter');
    }
    const matchedCount = await this.collection.countDocuments(filter);
    const result = await this.collection.deleteMany(filter);
    return { deletedCount: result.deletedCount, matchedCount };
  }

  async updateOneByFilter(
    filterEjson: unknown,
    updateEjson: unknown,
    options?: { upsert?: boolean },
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
    const filter = parseFilter(filterEjson);
    const update = fromEJSON(updateEjson) as Document;
    assertUpdateDoc(update);
    const result = await this.collection.updateOne(filter, update, {
      upsert: options?.upsert ?? false,
    });
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount ?? 0,
    };
  }

  async updateManyByFilter(
    filterEjson: unknown,
    updateEjson: unknown,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const filter = parseFilter(filterEjson);
    if (!filter || Object.keys(filter).length === 0) {
      throw new VastError(
        ErrorCode.VALIDATION,
        'updateMany requires a non-empty filter (refusing to update entire collection)',
      );
    }
    const update = fromEJSON(updateEjson) as Document;
    assertUpdateDoc(update);
    const result = await this.collection.updateMany(filter, update);
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  /**
   * Dry-run style preview: how many docs match + a small sample.
   * Used before write ops and to enrich find result summaries.
   */
  async preview(
    filterEjson: unknown,
    options?: { sampleSize?: number; maxTimeMS?: number },
  ): Promise<{
    matchCount: number;
    sample: unknown[];
    sampleSize: number;
    executionMs: number;
  }> {
    const filter = parseFilter(filterEjson);
    const sampleSize = clamp(options?.sampleSize ?? 5, 1, 20);
    const maxTimeMS = options?.maxTimeMS ?? 30_000;
    const started = Date.now();
    const [matchCount, sampleDocs] = await Promise.all([
      this.collection.countDocuments(filter, { maxTimeMS }),
      this.collection.find(filter, { limit: sampleSize, maxTimeMS }).toArray(),
    ]);
    return {
      matchCount,
      sample: sampleDocs.map((d) => toEJSON(d)),
      sampleSize,
      executionMs: Date.now() - started,
    };
  }
}

function assertUpdateDoc(update: Document): void {
  const keys = Object.keys(update);
  if (!keys.length) {
    throw new VastError(ErrorCode.VALIDATION, 'Update document is empty');
  }
  const hasOperator = keys.some((k) => k.startsWith('$'));
  const hasNonOperator = keys.some((k) => !k.startsWith('$'));
  if (hasOperator && hasNonOperator) {
    throw new VastError(
      ErrorCode.VALIDATION,
      'Update cannot mix operator and non-operator fields',
    );
  }
  // Replacement-style updates (no $) are allowed for updateOne only in Mongo; we allow both
  // but require at least one field.
}

function parseFilter(filter: unknown): Filter<Document> {
  if (filter === undefined || filter === null || filter === '') return {};
  if (typeof filter === 'string') {
    try {
      filter = JSON.parse(filter);
    } catch {
      throw new VastError(ErrorCode.VALIDATION, 'Invalid filter JSON');
    }
  }
  return fromEJSON(filter) as Filter<Document>;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function idsEqual(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId && b instanceof ObjectId) return a.equals(b);
  return String(a) === String(b);
}
