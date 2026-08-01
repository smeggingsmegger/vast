/**
 * Integration tests against a real MongoDB instance.
 * Requires mongodb://127.0.0.1:27017 (or MONGO_URI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId, Decimal128, Long } from 'mongodb';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionManager } from '@vast/mongo-core';
import { createApp } from './app.js';
import { ConnectionStore } from './store/connection-store.js';
import { JobService } from './jobs.js';
import { createLogger } from './logger.js';
import type { VastConfig } from './config.js';

const MONGO_URI =
  process.env.MONGO_URI ??
  process.env.VAST_TEST_MONGO_URI ??
  'mongodb://127.0.0.1:27027';
const DB = `vast_it_${Date.now()}`;

/** Read a number from canonical EJSON (`$numberInt` / `$numberLong`) or plain number. */
function ejsonNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    if ('$numberInt' in v) return Number((v as { $numberInt: string }).$numberInt);
    if ('$numberLong' in v) return Number((v as { $numberLong: string }).$numberLong);
    if ('$numberDouble' in v) return Number((v as { $numberDouble: string }).$numberDouble);
  }
  return Number(v);
}

async function mongoAvailable(): Promise<boolean> {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    // Ensure we can write (auth-free test instance)
    const probe = client.db(`vast_probe_${Date.now()}`);
    await probe.collection('t').insertOne({ ok: 1 });
    await probe.dropDatabase();
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

const available = await mongoAvailable();

describe.skipIf(!available)('Mongo integration via HTTP API', () => {
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let connections: ConnectionManager;
  let connectionId: string;
  let base: string;

  async function api(path: string, init?: RequestInit) {
    const res = await app.request(base + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, res };
  }

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'vast-it-'));
    connections = new ConnectionManager();
    const store = new ConnectionStore(dataDir, 'test-secret');
    const jobs = new JobService(dataDir);
    const config: VastConfig = {
      port: 0,
      bind: '127.0.0.1',
      runtime: 'web',
      authMode: 'none',
      password: undefined,
      secretKey: 'test-secret',
      dataDir,
      readOnly: false,
      maxQueryDocs: 10_000,
      maxImportBytes: 50_000_000,
      basePath: '/',
      logLevel: 'silent',
      webDistDir: undefined,
      version: '0.1.0-test',
    };
    app = createApp({
      config,
      log: createLogger('silent'),
      connections,
      store,
      jobs,
      startedAt: Date.now(),
    });
    base = 'http://localhost';

    const created = await api('/api/v1/connections', {
      method: 'POST',
      body: JSON.stringify({ name: 'it', uri: MONGO_URI, color: 'teal', readOnly: false }),
    });
    expect(created.status).toBe(201);
    connectionId = (created.json as { data: { id: string } }).data.id;
    const conn = await api(`/api/v1/connections/${connectionId}/connect`, { method: 'POST' });
    expect(conn.status).toBe(200);
    expect((conn.json as { data: { status: string } }).data.status).toBe('connected');
  });

  afterAll(async () => {
    try {
      const managed = connections.listConnectedIds()[0];
      if (managed) {
        const m = connections.get(managed);
        if (m) await m.client.db(DB).dropDatabase().catch(() => undefined);
      } else {
        const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        try {
          await client.connect();
          await client.db(DB).dropDatabase().catch(() => undefined);
        } finally {
          await client.close().catch(() => undefined);
        }
      }
    } finally {
      await connections.disconnectAll();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('lists databases and creates collection', async () => {
    const dbs = await api(`/api/v1/c/${connectionId}/databases`);
    expect(dbs.status).toBe(200);
    expect(Array.isArray((dbs.json as { data: unknown[] }).data)).toBe(true);

    const createDb = await api(`/api/v1/c/${connectionId}/databases`, {
      method: 'POST',
      body: JSON.stringify({ name: DB }),
    });
    expect(createDb.status).toBe(201);

    const createCol = await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
      method: 'POST',
      body: JSON.stringify({ name: 'users' }),
    });
    expect(createCol.status).toBe(201);
  });

  it('inserts mixed BSON document, finds, updates, converts type, deletes', async () => {
    const exactLong = '9007199254740993';
    const doc = {
      name: 'Ada',
      age: 36,
      joined: { $date: '2020-05-01T00:00:00.000Z' },
      balance: { $numberDecimal: '99.50' },
      big: { $numberLong: exactLong },
      nested: { tags: ['dev', 'mongo'] },
    };
    const ins = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/documents`, {
      method: 'POST',
      body: JSON.stringify({ document: doc }),
    });
    expect(ins.status).toBe(201);
    const inserted = (
      ins.json as {
        data: {
          _id: { $oid: string };
          name: string;
          balance: { $numberDecimal: string } | string | number;
          big: { $numberLong: string } | number | string;
          joined: { $date: string } | string;
        };
      }
    ).data;
    expect(inserted.name).toBe('Ada');
    expect(inserted._id.$oid).toMatch(/^[a-f0-9]{24}$/i);
    // Exact BSON type fidelity — would fail under relaxed EJSON corruption
    expect(inserted.balance).toEqual({ $numberDecimal: '99.50' });
    expect(inserted.big).toEqual({ $numberLong: exactLong });
    expect(typeof inserted.big === 'object' && inserted.big && '$numberLong' in inserted.big).toBe(
      true,
    );
    expect(
      typeof inserted.big === 'number' ? String(inserted.big) : (inserted.big as { $numberLong: string }).$numberLong,
    ).toBe(exactLong);

    const find = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/find`, {
      method: 'POST',
      body: JSON.stringify({ filter: { name: 'Ada' }, limit: 10 }),
    });
    expect(find.status).toBe(200);
    const found = (
      find.json as {
        data: {
          big: { $numberLong: string } | number;
          balance: { $numberDecimal: string };
        }[];
        page: { returned: number };
      }
    ).data;
    expect(found.length).toBeGreaterThanOrEqual(1);
    const row = found[0]!;
    expect(row.big).toEqual({ $numberLong: exactLong });
    expect(row.balance).toEqual({ $numberDecimal: '99.50' });

    const id = inserted._id.$oid;
    const patch = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ set: { age: 37 } }),
    });
    expect(patch.status).toBe(200);
    const patchedAge = (patch.json as { data: { age: number | { $numberInt: string } } }).data.age;
    expect(ejsonNumber(patchedAge)).toBe(37);

    const convert = await api(
      `/api/v1/c/${connectionId}/db/${DB}/col/users/documents/${id}/convert-field`,
      {
        method: 'POST',
        body: JSON.stringify({ path: 'age', toType: 'string' }),
      },
    );
    expect(convert.status).toBe(200);
    expect((convert.json as { data: { age: string } }).data.age).toBe('37');

    const replace = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        document: {
          _id: { $oid: id },
          name: 'Ada Lovelace',
          age: '37',
          joined: { $date: '2020-05-01T00:00:00.000Z' },
        },
      }),
    });
    expect(replace.status).toBe(200);
    expect((replace.json as { data: { name: string } }).data.name).toBe('Ada Lovelace');

    const del = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/documents/${id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);
    expect((del.json as { data: { deleted: boolean } }).data.deleted).toBe(true);
  });

  it('runs aggregation, creates/drops index, analyzes schema', async () => {
    // seed a few docs
    await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/documents/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        documents: [
          { name: 'a', score: 1 },
          { name: 'b', score: 2 },
          { name: 'c', score: 3 },
        ],
      }),
    });

    const agg = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/aggregate`, {
      method: 'POST',
      body: JSON.stringify({
        pipeline: [{ $match: { score: { $gte: 2 } } }, { $group: { _id: null, total: { $sum: '$score' } } }],
      }),
    });
    expect(agg.status).toBe(200);
    const rows = (agg.json as { data: { total: number | { $numberInt: string } }[] }).data;
    expect(ejsonNumber(rows[0]?.total)).toBe(5);

    const idx = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/indexes`, {
      method: 'POST',
      body: JSON.stringify({ keys: { name: 1 }, name: 'name_1', unique: false }),
    });
    expect(idx.status).toBe(201);

    const listIdx = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/indexes`);
    expect(listIdx.status).toBe(200);
    const names = (listIdx.json as { data: { name: string }[] }).data.map((i) => i.name);
    expect(names).toContain('name_1');

    const dropIdx = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/indexes/name_1`, {
      method: 'DELETE',
    });
    expect(dropIdx.status).toBe(200);

    const schema = await api(`/api/v1/c/${connectionId}/db/${DB}/col/users/schema/analyze`, {
      method: 'POST',
      body: JSON.stringify({ sampleSize: 100 }),
    });
    expect(schema.status).toBe(200);
    expect((schema.json as { data: { sampleSize: number } }).data.sampleSize).toBeGreaterThan(0);
  });

  it('imports JSONL, exports, dump and restore', async () => {
    const col = 'import_export';
    await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
      method: 'POST',
      body: JSON.stringify({ name: col }),
    });

    const jsonl = [
      JSON.stringify({ sku: 'A1', qty: 1 }),
      JSON.stringify({ sku: 'B2', qty: 2 }),
      JSON.stringify({ sku: 'C3', qty: 3 }),
    ].join('\n');

    const imp = await api(`/api/v1/c/${connectionId}/db/${DB}/col/${col}/import`, {
      method: 'POST',
      body: JSON.stringify({ format: 'jsonl', content: jsonl }),
    });
    expect(imp.status).toBe(200);
    expect((imp.json as { data: { insertedCount: number } }).data.insertedCount).toBe(3);

    const exp = await api(`/api/v1/c/${connectionId}/db/${DB}/col/${col}/export`, {
      method: 'POST',
      body: JSON.stringify({ format: 'jsonl', limit: 100 }),
    });
    expect(exp.status).toBe(200);
    expect((exp.json as { data: { count: number; text: string } }).data.count).toBe(3);
    expect((exp.json as { data: { text: string } }).data.text).toContain('A1');

    const dump = await api(`/api/v1/c/${connectionId}/dump`, {
      method: 'POST',
      body: JSON.stringify({ database: DB, collections: [col] }),
    });
    expect(dump.status).toBe(200);
    const dumpDir = (dump.json as { data: { directory: string } }).data.directory;
    expect(dumpDir).toBeTruthy();

    // Path traversal must be rejected
    const traverse = await api(`/api/v1/c/${connectionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({
        targetDatabase: `${DB}_evil`,
        dumpDir: '/etc',
        drop: false,
      }),
    });
    expect(traverse.status).toBe(400);
    expect((traverse.json as { error: { code: string } }).error.code).toBe('VALIDATION');

    const restoreDb = `${DB}_restored`;
    const restore = await api(`/api/v1/c/${connectionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ targetDatabase: restoreDb, dumpDir, drop: true }),
    });
    expect(restore.status).toBe(200);
    const restored = (restore.json as { data: { collections: { name: string; inserted: number }[] } })
      .data.collections;
    expect(restored.find((c) => c.name === col)?.inserted).toBe(3);

    // cleanup restore db
    await api(`/api/v1/c/${connectionId}/databases/${restoreDb}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmName: restoreDb }),
    });
  });

  it('rejects writes on read-only connection', async () => {
    const store = new ConnectionStore(dataDir, 'test-secret');
    // create RO connection via API
    const created = await api('/api/v1/connections', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ro',
        uri: MONGO_URI,
        color: 'amber',
        readOnly: true,
      }),
    });
    const roId = (created.json as { data: { id: string } }).data.id;
    await api(`/api/v1/connections/${roId}/connect`, { method: 'POST' });

    const write = await api(`/api/v1/c/${roId}/db/${DB}/col/users/documents`, {
      method: 'POST',
      body: JSON.stringify({ document: { name: 'nope' } }),
    });
    expect(write.status).toBe(403);
    expect((write.json as { error: { code: string } }).error.code).toBe('READ_ONLY');
    void store;
  });

  it('server info returns version', async () => {
    const info = await api(`/api/v1/c/${connectionId}/server-info`);
    expect(info.status).toBe(200);
    expect(JSON.stringify(info.json)).toMatch(/version/i);
  });

  // keep bson imports used for type awareness in assertions
  void ObjectId;
  void Decimal128;
  void Long;
});
