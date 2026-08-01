import type { Collection, Document } from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';
import { fromEJSON, toEJSON } from './ejson.js';

export class AggregationService {
  constructor(private readonly collection: Collection<Document>) {}

  async run(
    pipelineEjson: unknown[],
    options: { allowDiskUse?: boolean; maxTimeMS?: number; limit?: number } = {},
  ): Promise<{ data: unknown[]; executionMs: number; returned: number }> {
    if (!Array.isArray(pipelineEjson)) {
      throw new VastError(ErrorCode.VALIDATION, 'Pipeline must be an array');
    }
    const pipeline = fromEJSON(pipelineEjson) as Document[];
    // Safety: append limit if not present for UI previews
    const limit = options.limit ?? 100;
    const hasLimit = pipeline.some((s) => s && typeof s === 'object' && ('$limit' in s || '$out' in s || '$merge' in s));
    const stages = hasLimit ? pipeline : [...pipeline, { $limit: limit }];

    const started = Date.now();
    const cursor = this.collection.aggregate(stages, {
      allowDiskUse: options.allowDiskUse ?? false,
      maxTimeMS: options.maxTimeMS ?? 30_000,
    });
    const docs = await cursor.toArray();
    return {
      data: docs.map((d) => toEJSON(d)),
      executionMs: Date.now() - started,
      returned: docs.length,
    };
  }

  async explain(pipelineEjson: unknown[]): Promise<unknown> {
    const pipeline = fromEJSON(pipelineEjson) as Document[];
    const result = await this.collection.aggregate(pipeline).explain('executionStats');
    return toEJSON(result);
  }
}
