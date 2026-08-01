import { Hono } from 'hono';
import {
  AggregateBodySchema,
  ConvertFieldBodySchema,
  CreateCollectionBodySchema,
  CreateDatabaseBodySchema,
  CreateIndexBodySchema,
  DropConfirmSchema,
  DumpBodySchema,
  ErrorCode,
  ExportBodySchema,
  FindBodySchema,
  ImportBodySchema,
  InsertManyBodySchema,
  InsertOneBodySchema,
  PatchBodySchema,
  ReplaceBodySchema,
  RestoreBodySchema,
  SchemaAnalyzeBodySchema,
  VastError,
} from '@vast/shared';
import {
  AdminService,
  AggregationService,
  CollectionService,
  DatabaseService,
  DocumentService,
  IndexService,
  analyzeDocuments,
  dumpDatabase,
  exportCsvString,
  exportJsonArrayString,
  exportJsonlToString,
  fromEJSON,
  importJsonArray,
  importJsonl,
  restoreDatabase,
} from '@vast/mongo-core';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import type { AppContext } from '../app-context.js';
import { resolveUnderJobsDir } from '../path-safety.js';


function requireConn(ctx: AppContext, cid: string) {
  return ctx.connections.require(cid);
}

function requireWritable(ctx: AppContext, cid: string) {
  if (ctx.config.readOnly) {
    throw new VastError(ErrorCode.READ_ONLY, 'Server is in global read-only mode');
  }
  return ctx.connections.assertWritable(cid);
}

export function mongoRoutes(ctx: AppContext) {
  const r = new Hono();

  // Databases
  r.get('/c/:cid/databases', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const data = await new DatabaseService(client).list();
    return c.json({ data });
  });

  r.post('/c/:cid/databases', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = CreateDatabaseBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    await new DatabaseService(client).create(body.name);
    return c.json({ ok: true, name: body.name }, 201);
  });

  r.delete('/c/:cid/databases/:db', async (c) => {
    const cid = c.req.param('cid');
    const dbName = c.req.param('db');
    requireWritable(ctx, cid);
    const body = DropConfirmSchema.parse(await c.req.json().catch(() => ({})));
    if (body.confirmName !== dbName) {
      throw new VastError(ErrorCode.VALIDATION, 'confirmName must match database name');
    }
    const { client } = requireConn(ctx, cid);
    await new DatabaseService(client).drop(dbName);
    return c.json({ ok: true });
  });

  r.get('/c/:cid/databases/:db/stats', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const data = await new DatabaseService(client).stats(c.req.param('db'));
    return c.json({ data });
  });

  // Collections
  r.get('/c/:cid/db/:db/collections', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const db = new DatabaseService(client).db(c.req.param('db'));
    const svc = new CollectionService(db);
    const list = await svc.list();
    const data = await Promise.all(
      list.map(async (col) => {
        let estimatedCount: number | undefined;
        try {
          estimatedCount = await svc.estimatedCount(col.name);
        } catch {
          // ignore
        }
        return { ...col, estimatedCount };
      }),
    );
    return c.json({ data });
  });

  r.post('/c/:cid/db/:db/collections', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = CreateCollectionBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const db = new DatabaseService(client).db(c.req.param('db'));
    await new CollectionService(db).create(body.name, {
      capped: body.capped,
      size: body.size,
      max: body.max,
    });
    return c.json({ ok: true, name: body.name }, 201);
  });

  r.delete('/c/:cid/db/:db/collections/:col', async (c) => {
    const cid = c.req.param('cid');
    const colName = c.req.param('col');
    requireWritable(ctx, cid);
    const body = DropConfirmSchema.parse(await c.req.json().catch(() => ({})));
    if (body.confirmName !== colName) {
      throw new VastError(ErrorCode.VALIDATION, 'confirmName must match collection name');
    }
    const { client } = requireConn(ctx, cid);
    const db = new DatabaseService(client).db(c.req.param('db'));
    await new CollectionService(db).drop(colName);
    return c.json({ ok: true });
  });

  r.get('/c/:cid/db/:db/collections/:col/stats', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const db = new DatabaseService(client).db(c.req.param('db'));
    const data = await new CollectionService(db).stats(c.req.param('col'));
    return c.json({ data });
  });

  // Documents
  r.post('/c/:cid/db/:db/col/:col/find', async (c) => {
    const body = FindBodySchema.parse(await c.req.json().catch(() => ({})));
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const result = await new DocumentService(col).find({
      ...body,
      limit: Math.min(body.limit ?? 50, ctx.config.maxQueryDocs),
    });
    return c.json(result);
  });

  r.post('/c/:cid/db/:db/col/:col/count', async (c) => {
    const body = FindBodySchema.pick({ filter: true, maxTimeMS: true }).parse(
      await c.req.json().catch(() => ({})),
    );
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const count = await new DocumentService(col).count(body.filter, body.maxTimeMS);
    return c.json({ data: { count } });
  });

  r.post('/c/:cid/db/:db/col/:col/documents', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = InsertOneBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const data = await new DocumentService(col).insertOne(body.document);
    return c.json({ data }, 201);
  });

  r.post('/c/:cid/db/:db/col/:col/documents/bulk', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = InsertManyBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const data = await new DocumentService(col).insertMany(body.documents);
    return c.json({ data }, 201);
  });

  r.get('/c/:cid/db/:db/col/:col/documents/:id', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    let idEjson: unknown = c.req.param('id');
    const q = c.req.query('id');
    if (q) {
      try {
        idEjson = JSON.parse(q);
      } catch {
        idEjson = q;
      }
    } else if (/^[a-f0-9]{24}$/i.test(String(idEjson))) {
      idEjson = { $oid: String(idEjson) };
    }
    const data = await new DocumentService(col).findById(idEjson);
    if (!data) throw new VastError(ErrorCode.NOT_FOUND, 'Document not found');
    return c.json({ data });
  });

  r.put('/c/:cid/db/:db/col/:col/documents/:id', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = ReplaceBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const idEjson = resolveId(c.req.param('id'), c.req.query('id'));
    const data = await new DocumentService(col).replaceOne(idEjson, body.document);
    return c.json({ data });
  });

  r.patch('/c/:cid/db/:db/col/:col/documents/:id', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = PatchBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const idEjson = resolveId(c.req.param('id'), c.req.query('id'));
    const data = await new DocumentService(col).patchFields(idEjson, body);
    return c.json({ data });
  });

  r.post('/c/:cid/db/:db/col/:col/documents/:id/convert-field', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = ConvertFieldBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const idEjson = resolveId(c.req.param('id'), c.req.query('id'));
    const data = await new DocumentService(col).convertField(idEjson, body.path, body.toType);
    return c.json({ data });
  });

  r.delete('/c/:cid/db/:db/col/:col/documents/:id', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const idEjson = resolveId(c.req.param('id'), c.req.query('id'));
    const data = await new DocumentService(col).deleteOne(idEjson);
    return c.json({ data });
  });

  // Aggregation
  r.post('/c/:cid/db/:db/col/:col/aggregate', async (c) => {
    const body = AggregateBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, c.req.param('cid'));
    // $out/$merge require write
    const writes = body.pipeline.some(
      (s) => s && typeof s === 'object' && ('$out' in (s as object) || '$merge' in (s as object)),
    );
    if (writes) requireWritable(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const result = await new AggregationService(col).run(body.pipeline, body);
    return c.json(result);
  });

  r.post('/c/:cid/db/:db/col/:col/aggregate/explain', async (c) => {
    const body = AggregateBodySchema.pick({ pipeline: true }).parse(await c.req.json());
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const data = await new AggregationService(col).explain(body.pipeline);
    return c.json({ data });
  });

  // Indexes
  r.get('/c/:cid/db/:db/col/:col/indexes', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const data = await new IndexService(col).list();
    return c.json({ data });
  });

  r.post('/c/:cid/db/:db/col/:col/indexes', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = CreateIndexBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const indexOpts: {
      name?: string;
      unique?: boolean;
      sparse?: boolean;
      expireAfterSeconds?: number;
    } = {};
    if (body.name !== undefined) indexOpts.name = body.name;
    if (body.unique !== undefined) indexOpts.unique = body.unique;
    if (body.sparse !== undefined) indexOpts.sparse = body.sparse;
    if (body.expireAfterSeconds !== undefined) indexOpts.expireAfterSeconds = body.expireAfterSeconds;
    const name = await new IndexService(col).create(body.keys, indexOpts);
    return c.json({ data: { name } }, 201);
  });

  r.delete('/c/:cid/db/:db/col/:col/indexes/:name', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    await new IndexService(col).drop(c.req.param('name'));
    return c.json({ ok: true });
  });

  // Schema
  r.post('/c/:cid/db/:db/col/:col/schema/analyze', async (c) => {
    const body = SchemaAnalyzeBodySchema.parse(await c.req.json().catch(() => ({})));
    const sampleSize = body.sampleSize ?? 1000;
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    let docs: Record<string, unknown>[];
    try {
      docs = (await col
        .aggregate([{ $sample: { size: sampleSize } }])
        .toArray()) as Record<string, unknown>[];
    } catch {
      docs = (await col.find({}).limit(sampleSize).toArray()) as Record<string, unknown>[];
    }
    const data = analyzeDocuments(docs);
    return c.json({ data });
  });

  // Import / Export
  r.post('/c/:cid/db/:db/col/:col/import', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = ImportBodySchema.parse(await c.req.json());
    if (body.content.length > ctx.config.maxImportBytes) {
      throw new VastError(ErrorCode.VALIDATION, 'Import payload too large');
    }
    const { client } = requireConn(ctx, cid);
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    let data;
    if (body.format === 'json') {
      data = await importJsonArray(col, body.content);
    } else {
      data = await importJsonl(col, Readable.from([body.content]));
    }
    return c.json({ data });
  });

  r.post('/c/:cid/db/:db/col/:col/export', async (c) => {
    const body = ExportBodySchema.parse(await c.req.json().catch(() => ({ format: 'jsonl' })));
    const { client } = requireConn(ctx, c.req.param('cid'));
    const col = client.db(c.req.param('db')).collection(c.req.param('col'));
    const filter = body.filter ? (fromEJSON(body.filter) as object) : {};
    const limit = body.limit ?? 10_000;
    let result;
    if (body.format === 'json') result = await exportJsonArrayString(col, filter, limit);
    else if (body.format === 'csv') result = await exportCsvString(col, filter, limit);
    else result = await exportJsonlToString(col, filter, limit);
    return c.json({ data: result });
  });

  // Dump / Restore
  r.post('/c/:cid/dump', async (c) => {
    const cid = c.req.param('cid');
    // dump is read
    const body = DumpBodySchema.parse(await c.req.json());
    const { client } = requireConn(ctx, cid);
    const job = ctx.jobs.create('dump');
    const dir = ctx.jobs.artifactDir(job.id);
    ctx.jobs.update(job.id, { status: 'running', progress: { processed: 0, message: 'Dumping…' } });
    try {
      const result = await dumpDatabase(client, body.database, join(dir, 'dump'), {
        collections: body.collections,
      });
      ctx.jobs.update(job.id, {
        status: 'completed',
        result,
        artifactPath: result.directory,
        progress: { processed: result.collections.reduce((a, x) => a + x.count, 0), message: 'Done' },
      });
      return c.json({ data: { jobId: job.id, ...result } });
    } catch (err) {
      ctx.jobs.update(job.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'dump failed',
      });
      throw err;
    }
  });

  r.post('/c/:cid/restore', async (c) => {
    const cid = c.req.param('cid');
    requireWritable(ctx, cid);
    const body = RestoreBodySchema.parse(await c.req.json());
    const safeDumpDir = resolveUnderJobsDir(ctx.jobs.jobsDir, body.dumpDir);
    const { client } = requireConn(ctx, cid);
    const job = ctx.jobs.create('restore');
    ctx.jobs.update(job.id, { status: 'running' });
    try {
      const result = await restoreDatabase(client, body.targetDatabase, safeDumpDir, {
        drop: body.drop,
      });
      ctx.jobs.update(job.id, { status: 'completed', result });
      return c.json({ data: { jobId: job.id, ...result } });
    } catch (err) {
      ctx.jobs.update(job.id, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'restore failed',
      });
      throw err;
    }
  });

  // Admin
  r.get('/c/:cid/server-info', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const data = await new AdminService(client).serverInfo();
    return c.json({ data });
  });

  r.get('/c/:cid/server-status', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const data = await new AdminService(client).serverStatus();
    return c.json({ data });
  });

  r.get('/c/:cid/current-op', async (c) => {
    const { client } = requireConn(ctx, c.req.param('cid'));
    const data = await new AdminService(client).currentOp();
    return c.json({ data });
  });

  // Jobs
  r.get('/jobs', (c) => c.json({ data: ctx.jobs.list() }));
  r.get('/jobs/:id', (c) => {
    const job = ctx.jobs.get(c.req.param('id'));
    if (!job) throw new VastError(ErrorCode.NOT_FOUND, 'Job not found');
    return c.json({ data: job });
  });

  return r;
}

function resolveId(pathId: string, queryId?: string): unknown {
  if (queryId) {
    try {
      return JSON.parse(queryId);
    } catch {
      return queryId;
    }
  }
  if (/^[a-f0-9]{24}$/i.test(pathId)) return { $oid: pathId };
  return pathId;
}
