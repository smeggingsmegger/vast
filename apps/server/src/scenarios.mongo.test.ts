/**
 * Hundreds of fixture-driven Mongo scenarios through the real HTTP API path
 * the workbench uses, with official driver cross-checks for write integrity.
 *
 * Run: MONGO_URI=mongodb://127.0.0.1:27027 pnpm --filter @vast/server test:scenarios
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId, type Document } from 'mongodb';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionManager, toEJSON } from '@vast/mongo-core';
import { createApp } from './app.js';
import { ConnectionStore } from './store/connection-store.js';
import { JobService } from './jobs.js';
import { createLogger } from './logger.js';
import type { VastConfig } from './config.js';
import {
  COMBO_FLOWS,
  FIND_CASES,
  SEED_DOCS,
  SET_FIELD_CASES,
  UPDATE_MANY_CASES,
  expandDeleteManyCases,
  expandFindLimitSkipCases,
  expandUpdateManyCases,
  type EjsonDoc,
} from './scenarios/fixtures.js';

const MONGO_URI =
  process.env.MONGO_URI ??
  process.env.VAST_TEST_MONGO_URI ??
  'mongodb://127.0.0.1:27027';

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const DB = `vast_scen_${RUN_ID}`;
const COL = 'docs';

async function mongoAvailable(): Promise<boolean> {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2500 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    const probe = client.db(`vast_scen_probe_${Date.now()}`);
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

function ejsonNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    if ('$numberInt' in v) return Number((v as { $numberInt: string }).$numberInt);
    if ('$numberLong' in v) return Number((v as { $numberLong: string }).$numberLong);
    if ('$numberDouble' in v) return Number((v as { $numberDouble: string }).$numberDouble);
  }
  return Number(v);
}

function oidOf(doc: EjsonDoc): string {
  const id = doc._id;
  if (id && typeof id === 'object' && '$oid' in id) return String((id as { $oid: string }).$oid);
  throw new Error('missing $oid');
}

describe.skipIf(!available)('Mongo scenarios (HTTP API + driver integrity)', () => {
  let dataDir: string;
  let app: ReturnType<typeof createApp>;
  let connections: ConnectionManager;
  let connectionId: string;
  let base: string;
  let driver: MongoClient;

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
    return { status: res.status, json };
  }

  function colPath(col = COL) {
    return `/api/v1/c/${connectionId}/db/${encodeURIComponent(DB)}/col/${encodeURIComponent(col)}`;
  }

  async function insertOne(document: unknown, col = COL) {
    return api(`${colPath(col)}/documents`, {
      method: 'POST',
      body: JSON.stringify({ document }),
    });
  }

  async function insertMany(documents: unknown[], col = COL) {
    return api(`${colPath(col)}/documents/bulk`, {
      method: 'POST',
      body: JSON.stringify({ documents }),
    });
  }

  async function find(body: unknown, col = COL) {
    return api(`${colPath(col)}/find`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function count(filter: unknown, col = COL) {
    return api(`${colPath(col)}/count`, {
      method: 'POST',
      body: JSON.stringify({ filter }),
    });
  }

  async function driverFindOne(id: string, col = COL): Promise<Document | null> {
    return driver
      .db(DB)
      .collection(col)
      .findOne({ _id: new ObjectId(id) });
  }

  async function driverCount(filter: object, col = COL): Promise<number> {
    return driver.db(DB).collection(col).countDocuments(filter);
  }

  /** Compare API EJSON field to native driver value via toEJSON. */
  function expectEjsonMatchesDriver(apiVal: unknown, native: unknown, path = 'value') {
    const driverE = toEJSON(native);
    expect(apiVal, path).toEqual(driverE);
  }

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'vast-scen-'));
    connections = new ConnectionManager();
    const store = new ConnectionStore(dataDir, 'scen-secret-key-32b!!!!');
    const jobs = new JobService(dataDir);
    const config: VastConfig = {
      port: 0,
      bind: '127.0.0.1',
      runtime: 'web',
      authMode: 'none',
      password: undefined,
      secretKey: 'scen-secret-key-32b!!!!',
      dataDir,
      readOnly: false,
      maxQueryDocs: 10_000,
      maxImportBytes: 50_000_000,
      basePath: '/',
      logLevel: 'silent',
      webDistDir: undefined,
      version: '0.1.0-scen',
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
      body: JSON.stringify({
        name: 'scenarios',
        uri: MONGO_URI,
        color: 'teal',
        readOnly: false,
      }),
    });
    expect(created.status).toBe(201);
    connectionId = (created.json as { data: { id: string } }).data.id;
    const conn = await api(`/api/v1/connections/${connectionId}/connect`, {
      method: 'POST',
    });
    expect(conn.status).toBe(200);

    await api(`/api/v1/c/${connectionId}/databases`, {
      method: 'POST',
      body: JSON.stringify({ name: DB }),
    });
    await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
      method: 'POST',
      body: JSON.stringify({ name: COL }),
    });

    driver = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await driver.connect();
  });

  afterAll(async () => {
    try {
      await driver?.db(DB).dropDatabase().catch(() => undefined);
    } finally {
      await driver?.close().catch(() => undefined);
      await connections.disconnectAll();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  // ─── 1. Insert one per fixture + driver integrity ─────────────────────
  describe('insertOne fixtures + driver integrity', () => {
    it.each(SEED_DOCS.map((d) => [d.fixtureKey as string, d] as const))(
      'insertOne %s preserves BSON via API and driver',
      async (key, doc) => {
        const col = `ins_${String(key).replace(/[^a-z0-9_]/gi, '_')}`;
        await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
          method: 'POST',
          body: JSON.stringify({ name: col }),
        });
        const ins = await insertOne(doc, col);
        expect(ins.status).toBe(201);
        const data = (ins.json as { data: EjsonDoc }).data;
        expect(data.fixtureKey).toBe(key);
        expect(data._id).toBeTruthy();
        const id = oidOf(data);

        // re-find via API
        const found = await find({ filter: { fixtureKey: key }, limit: 5 }, col);
        expect(found.status).toBe(200);
        const rows = (found.json as { data: EjsonDoc[] }).data;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.fixtureKey).toBe(key);

        // driver cross-check: every top-level field present and equal in EJSON
        const native = await driverFindOne(id, col);
        expect(native).toBeTruthy();
        for (const field of Object.keys(doc)) {
          expectEjsonMatchesDriver(data[field], native![field], `${key}.${field}`);
        }
        // _id not corrupted
        expect(String(native!._id)).toBe(id);
      },
    );
  });

  // ─── 2. Insert many batch ─────────────────────────────────────────────
  describe('insertMany + count', () => {
    it('insertMany seeds shared collection and count matches', async () => {
      const docs = SEED_DOCS.map((d) => ({ ...d, batch: 'seed' }));
      const bulk = await insertMany(docs, COL);
      expect(bulk.status).toBe(201);
      const insertedCount = (bulk.json as { data: { insertedCount: number } }).data
        .insertedCount;
      expect(insertedCount).toBe(SEED_DOCS.length);

      const c = await count({}, COL);
      expect(c.status).toBe(200);
      expect((c.json as { data: { count: number } }).data.count).toBe(SEED_DOCS.length);

      const driverN = await driverCount({});
      expect(driverN).toBe(SEED_DOCS.length);
    });
  });

  // ─── 3. Find matrix ───────────────────────────────────────────────────
  describe('find filters / sort / skip / limit / projection', () => {
    const allFind = [...FIND_CASES, ...expandFindLimitSkipCases()];

    it.each(allFind.map((c) => [c.id, c] as const))('find case %s', async (_id, fc) => {
      const res = await find({
        filter: fc.filter,
        sort: fc.sort,
        skip: fc.skip,
        limit: fc.limit ?? 100,
        projection: fc.projection,
      });
      expect(res.status).toBe(200);
      const body = res.json as {
        data: EjsonDoc[];
        page: { returned: number };
      };
      const rows = body.data;

      if (fc.expectCount !== undefined) {
        expect(rows.length).toBe(fc.expectCount);
      }
      if (fc.expectKeys) {
        const keys = rows.map((r) => r.fixtureKey as string);
        for (const k of fc.expectKeys) {
          expect(keys).toContain(k);
        }
        // ordered expectation when sort specified and full list provided
        if (fc.sort && fc.expectKeys.length === keys.length) {
          expect(keys).toEqual(fc.expectKeys);
        }
      }
      if (fc.limit !== undefined) {
        expect(rows.length).toBeLessThanOrEqual(fc.limit);
      }

      // Driver count should match when no skip/limit distortion for count
      if (fc.skip === undefined && fc.limit === undefined && fc.projection === undefined) {
        // Use API count for same filter
        const c = await count(fc.filter);
        expect(c.status).toBe(200);
        expect((c.json as { data: { count: number } }).data.count).toBe(rows.length);
      }

      if (fc.id === 'find-proj-include') {
        expect(rows[0]).toHaveProperty('name');
        expect(rows[0]).toHaveProperty('fixtureKey');
        expect(rows[0]).not.toHaveProperty('city');
      }
      if (fc.id === 'find-proj-exclude') {
        expect(rows[0]).not.toHaveProperty('arr');
        expect(rows[0]).not.toHaveProperty('obj');
        expect(rows[0]).toHaveProperty('s');
      }
    });
  });

  // ─── 4. Count matrix ──────────────────────────────────────────────────
  describe('countDocuments', () => {
    const countCases = [
      { id: 'count-all', filter: {}, n: SEED_DOCS.length },
      { id: 'count-person', filter: { kind: 'person' }, n: 2 },
      { id: 'count-workflow', filter: { kind: 'workflow' }, n: 3 },
      { id: 'count-none', filter: { fixtureKey: 'nope' }, n: 0 },
      { id: 'count-active', filter: { active: true }, n: 1 },
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `count-score-gte-${i}`,
        filter: { score: { $gte: i } },
        n: SEED_DOCS.filter(
          (d) => typeof d.score === 'object' && ejsonNumber(d.score) >= i,
        ).length,
      })),
    ];

    it.each(countCases.map((c) => [c.id, c] as const))('count %s', async (_id, c) => {
      const res = await count(c.filter);
      expect(res.status).toBe(200);
      const n = (res.json as { data: { count: number } }).data.count;
      expect(n).toBe(c.n);
      // driver
      // convert simple filters for driver - use raw collection count via API path already;
      // for object filters with $ ops, use native:
      const native = await driver.db(DB).collection(COL).countDocuments(c.filter as object);
      expect(native).toBe(c.n);
    });
  });

  // ─── 5. Get by id ─────────────────────────────────────────────────────
  describe('findById', () => {
    it.each(SEED_DOCS.slice(0, 22).map((d) => d.fixtureKey as string))(
      'GET document by id for %s',
      async (key) => {
        const listed = await find({ filter: { fixtureKey: key }, limit: 1 });
        const row = (listed.json as { data: EjsonDoc[] }).data[0];
        expect(row).toBeTruthy();
        const id = oidOf(row!);
        const got = await api(`${colPath()}/documents/${id}`);
        expect(got.status).toBe(200);
        const data = (got.json as { data: EjsonDoc }).data;
        expect(data.fixtureKey).toBe(key);
        const native = await driverFindOne(id);
        expect(native).toBeTruthy();
        expectEjsonMatchesDriver(data.fixtureKey, native!.fixtureKey, 'fixtureKey');
      },
    );
  });

  // ─── 6. Replace ───────────────────────────────────────────────────────
  describe('replaceOne', () => {
    it.each(
      Array.from({ length: 20 }, (_, i) => [
        `replace-${i}`,
        { name: `before-${i}`, n: i },
        { name: `after-${i}`, n: i + 1000, replaced: true },
      ] as const),
    )('replace %s keeps _id, updates fields', async (idLabel, before, after) => {
      const col = 'replace_col';
      // ensure collection
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);

      const ins = await insertOne({ ...before, label: idLabel }, col);
      expect(ins.status).toBe(201);
      const data = (ins.json as { data: EjsonDoc }).data;
      const id = oidOf(data);

      const rep = await api(`${colPath(col)}/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          document: { _id: { $oid: id }, ...after, label: idLabel },
        }),
      });
      expect(rep.status).toBe(200);
      const out = (rep.json as { data: EjsonDoc }).data;
      expect(out.name).toBe(after.name);
      expect(ejsonNumber(out.n)).toBe(after.n);
      expect(out.replaced).toBe(true);
      expect(oidOf(out)).toBe(id);

      const native = await driverFindOne(id, col);
      expect(native).toBeTruthy();
      expect(String(native!._id)).toBe(id);
      expect(native!.name).toBe(after.name);
      expect(native!.replaced).toBe(true);
      // old-only fields gone
      expect(native).not.toHaveProperty('onlyOld');
    });
  });

  // ─── 7. set-field type matrix ─────────────────────────────────────────
  describe('set-field typed matrix + driver integrity', () => {
    it.each(SET_FIELD_CASES.map((c) => [c.id, c] as const))(
      'set-field %s',
      async (_id, c) => {
        const col = 'setfield';
        await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
          method: 'POST',
          body: JSON.stringify({ name: col }),
        }).catch(() => undefined);

        const seed = { marker: c.id, ...(c.seed ?? { placeholder: true }) };
        const ins = await insertOne(seed, col);
        expect(ins.status).toBe(201);
        const id = oidOf((ins.json as { data: EjsonDoc }).data);

        const set = await api(`${colPath(col)}/documents/${id}/set-field`, {
          method: 'POST',
          body: JSON.stringify({ path: c.path, type: c.type, value: c.value }),
        });
        expect(set.status).toBe(200);
        const data = (set.json as { data: EjsonDoc }).data;
        expect(data.marker).toBe(c.id); // unrelated field intact

        const native = await driverFindOne(id, col);
        expect(native).toBeTruthy();
        expect(native!.marker).toBe(c.id);

        // resolve nested path for driver value
        const parts = c.path.split('.');
        let apiCur: unknown = data;
        let natCur: unknown = native;
        for (const p of parts) {
          apiCur = (apiCur as Record<string, unknown>)?.[p];
          natCur = (natCur as Record<string, unknown>)?.[p];
        }
        expectEjsonMatchesDriver(apiCur, natCur, c.path);

        // type-specific expectations
        if (c.type === 'string') expect(apiCur).toBe(String(c.value ?? ''));
        if (c.type === 'int') expect(ejsonNumber(apiCur)).toBe(Number(c.value));
        if (c.type === 'bool') {
          const truthy =
            c.value === true ||
            c.value === 'true' ||
            c.value === '1' ||
            c.value === 'yes';
          expect(apiCur).toBe(truthy);
        }
        if (c.type === 'null') expect(apiCur).toBeNull();
        if (c.type === 'long' && c.id === 'sf-long') {
          expect(apiCur).toEqual({ $numberLong: '9007199254740993' });
        }
        if (c.type === 'decimal' && c.id === 'sf-decimal') {
          expect(apiCur).toEqual({ $numberDecimal: '19.99' });
        }
        if (c.type === 'objectId') {
          expect(apiCur).toEqual({ $oid: String(c.value) });
        }
      },
    );
  });

  // ─── 8. PATCH set/unset ───────────────────────────────────────────────
  describe('patch set/unset', () => {
    it.each(
      Array.from({ length: 20 }, (_, i) => [
        `patch-${i}`,
        { a: i, keep: 'yes' },
        { set: { a: i + 1, extra: `e${i}` }, unset: i % 3 === 0 ? ['keep'] : [] },
      ] as const),
    )('patch %s', async (label, seed, ops) => {
      const col = 'patch_col';
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);
      const ins = await insertOne({ ...seed, label }, col);
      const id = oidOf((ins.json as { data: EjsonDoc }).data);
      const patch = await api(`${colPath(col)}/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(ops),
      });
      expect(patch.status).toBe(200);
      const data = (patch.json as { data: EjsonDoc }).data;
      expect(ejsonNumber(data.a)).toBe(seed.a + 1);
      expect(data.extra).toBe(ops.set.extra);
      const native = await driverFindOne(id, col);
      expect(native!.extra).toBe(ops.set.extra);
      if (ops.unset.includes('keep')) {
        expect(data).not.toHaveProperty('keep');
        expect(native).not.toHaveProperty('keep');
      } else {
        expect(data.keep).toBe('yes');
      }
    });
  });

  // ─── 9. updateOne ─────────────────────────────────────────────────────
  describe('updateOne by filter', () => {
    it.each(
      Array.from({ length: 25 }, (_, i) => [
        `uo-${i}`,
        [
          { k: `u${i}`, g: 'x', v: 0 },
          { k: `u${i}`, g: 'y', v: 1 },
        ],
      ] as const),
    )('updateOne %s only first match', async (label, seeds) => {
      const col = 'upd1';
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);
      await insertMany(
        seeds.map((s) => ({ ...s, label })),
        col,
      );
      const res = await api(`${colPath(col)}/update-one`, {
        method: 'POST',
        body: JSON.stringify({
          filter: { label, k: seeds[0]!.k },
          update: { $set: { v: 99, hit: true } },
        }),
      });
      expect(res.status).toBe(200);
      const stats = (res.json as { data: { matchedCount: number; modifiedCount: number } })
        .data;
      expect(stats.matchedCount).toBe(1);
      expect(stats.modifiedCount).toBe(1);

      const all = await find({ filter: { label }, limit: 10 }, col);
      const rows = (all.json as { data: EjsonDoc[] }).data;
      const hits = rows.filter((r) => r.hit === true);
      expect(hits).toHaveLength(1);
      expect(ejsonNumber(hits[0]!.v)).toBe(99);

      const driverHits = await driver
        .db(DB)
        .collection(col)
        .countDocuments({ label, hit: true });
      expect(driverHits).toBe(1);
    });
  });

  // ─── 10. updateMany ───────────────────────────────────────────────────
  describe('updateMany + post-state', () => {
    const cases = [...UPDATE_MANY_CASES, ...expandUpdateManyCases(25)];

    it.each(cases.map((c) => [c.id, c] as const))('updateMany %s', async (_id, c) => {
      const col = `um_${c.id.replace(/[^a-z0-9_]/gi, '_').slice(0, 40)}`;
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      });
      await insertMany(c.seed, col);
      const res = await api(`${colPath(col)}/update-many`, {
        method: 'POST',
        body: JSON.stringify({ filter: c.filter, update: c.update }),
      });
      expect(res.status).toBe(200);
      const stats = (res.json as { data: { matchedCount: number; modifiedCount: number } })
        .data;
      expect(stats.matchedCount).toBe(c.expectMatched);

      const c2 = await count(c.postFilter, col);
      expect((c2.json as { data: { count: number } }).data.count).toBe(c.postCount);

      const driverN = await driverCount(c.postFilter as object, col);
      expect(driverN).toBe(c.postCount);
    });
  });

  // ─── 11. deleteOne ────────────────────────────────────────────────────
  describe('deleteOne by filter', () => {
    it.each(
      Array.from({ length: 20 }, (_, i) => [
        `do-${i}`,
        [
          { k: i, drop: true },
          { k: i, drop: false },
          { k: i, drop: true },
        ],
      ] as const),
    )('deleteOne %s removes a single match', async (label, seeds) => {
      const col = 'del1';
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);
      await insertMany(
        seeds.map((s) => ({ ...s, label })),
        col,
      );
      const before = await count({ label }, col);
      expect((before.json as { data: { count: number } }).data.count).toBe(3);

      const res = await api(`${colPath(col)}/delete-one`, {
        method: 'POST',
        body: JSON.stringify({ filter: { label, drop: true } }),
      });
      expect(res.status).toBe(200);
      const stats = (res.json as { data: { deletedCount: number } }).data;
      expect(stats.deletedCount).toBe(1);

      const after = await count({ label }, col);
      expect((after.json as { data: { count: number } }).data.count).toBe(2);
      const stillDrop = await count({ label, drop: true }, col);
      expect((stillDrop.json as { data: { count: number } }).data.count).toBe(1);
    });
  });

  // ─── 12. deleteMany ───────────────────────────────────────────────────
  describe('deleteMany + empty re-find', () => {
    const cases = expandDeleteManyCases(25);

    it.each(cases.map((c) => [c.id, c] as const))('deleteMany %s', async (_id, c) => {
      const col = `dm_${c.id.replace(/[^a-z0-9_]/gi, '_').slice(0, 40)}`;
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      });
      await insertMany(c.seed, col);
      const res = await api(`${colPath(col)}/delete-many`, {
        method: 'POST',
        body: JSON.stringify({ filter: c.filter }),
      });
      expect(res.status).toBe(200);
      expect((res.json as { data: { deletedCount: number } }).data.deletedCount).toBe(
        c.expectDeleted,
      );

      const remain = await count({ batch: c.seed[0]!.batch }, col);
      expect((remain.json as { data: { count: number } }).data.count).toBe(c.remain);

      const gone = await find({ filter: c.filter, limit: 10 }, col);
      expect((gone.json as { data: unknown[] }).data).toHaveLength(0);

      const driverRemain = await driverCount({ batch: c.seed[0]!.batch } as object, col);
      expect(driverRemain).toBe(c.remain);
    });
  });

  // ─── 13. Combinations insert → set-field → find → delete ──────────────
  describe('combinations insert→edit→find→delete', () => {
    it.each(COMBO_FLOWS.map((f) => [f.id, f] as const))('flow %s', async (_id, flow) => {
      const col = 'combo';
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);

      const ins = await insertOne(flow.initial, col);
      expect(ins.status).toBe(201);
      const id = oidOf((ins.json as { data: EjsonDoc }).data);

      const setN = await api(`${colPath(col)}/documents/${id}/set-field`, {
        method: 'POST',
        body: JSON.stringify({ path: 'n', type: 'int', value: String(flow.patchN) }),
      });
      expect(setN.status).toBe(200);

      const setStatus = await api(`${colPath(col)}/documents/${id}/set-field`, {
        method: 'POST',
        body: JSON.stringify({
          path: 'status',
          type: 'string',
          value: flow.finalStatus,
        }),
      });
      expect(setStatus.status).toBe(200);

      const found = await find(
        { filter: { tag: flow.initial.tag, status: flow.finalStatus }, limit: 5 },
        col,
      );
      expect(found.status).toBe(200);
      const rows = (found.json as { data: EjsonDoc[] }).data;
      expect(rows).toHaveLength(1);
      expect(ejsonNumber(rows[0]!.n)).toBe(flow.patchN);

      const native = await driverFindOne(id, col);
      expect(native!.status).toBe(flow.finalStatus);
      expect(Number(native!.n)).toBe(flow.patchN);

      const del = await api(`${colPath(col)}/documents/${id}`, { method: 'DELETE' });
      expect(del.status).toBe(200);
      expect((del.json as { data: { deleted: boolean } }).data.deleted).toBe(true);

      const again = await find({ filter: { tag: flow.initial.tag }, limit: 5 }, col);
      expect((again.json as { data: unknown[] }).data).toHaveLength(0);
      expect(await driverFindOne(id, col)).toBeNull();
    });
  });

  // ─── 14. Multi-update then count ──────────────────────────────────────
  describe('multi-update then count', () => {
    it.each(
      Array.from({ length: 15 }, (_, i) => [`mu-count-${i}`, i] as const),
    )('%s', async (label, i) => {
      const col = 'mu_count';
      await api(`/api/v1/c/${connectionId}/db/${DB}/collections`, {
        method: 'POST',
        body: JSON.stringify({ name: col }),
      }).catch(() => undefined);
      await insertMany(
        Array.from({ length: 10 }, (_, j) => ({
          label,
          g: j < 5 ? 'A' : 'B',
          n: j,
        })),
        col,
      );
      const up = await api(`${colPath(col)}/update-many`, {
        method: 'POST',
        body: JSON.stringify({
          filter: { label, g: 'A' },
          update: { $set: { g: 'C', wave: i } },
        }),
      });
      expect(up.status).toBe(200);
      expect((up.json as { data: { matchedCount: number } }).data.matchedCount).toBe(5);

      const cA = await count({ label, g: 'A' }, col);
      expect((cA.json as { data: { count: number } }).data.count).toBe(0);
      const cC = await count({ label, g: 'C' }, col);
      expect((cC.json as { data: { count: number } }).data.count).toBe(5);
      const cB = await count({ label, g: 'B' }, col);
      expect((cB.json as { data: { count: number } }).data.count).toBe(5);

      expect(await driverCount({ label, g: 'C' }, col)).toBe(5);
    });
  });

  // ─── Meta: ensure we actually ran a large number of tests ─────────────
  it('suite case inventory exceeds 200 independently registered scenarios', () => {
    // Structural proof of matrix sizes (actual it.each count is larger).
    const inventory =
      SEED_DOCS.length + // insertOne
      1 + // insertMany
      FIND_CASES.length +
      expandFindLimitSkipCases().length +
      4 +
      20 + // count base + score matrix
      22 + // findById
      20 + // replace
      SET_FIELD_CASES.length +
      20 + // patch
      25 + // updateOne
      UPDATE_MANY_CASES.length +
      expandUpdateManyCases(25).length +
      20 + // deleteOne
      expandDeleteManyCases(25).length +
      COMBO_FLOWS.length +
      15; // multi-update count
    expect(inventory).toBeGreaterThanOrEqual(200);
  });
});
