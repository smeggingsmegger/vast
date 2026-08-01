import { createWriteStream, createReadStream, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import type { Db, Document, MongoClient } from 'mongodb';
import { parseEJSON, stringifyEJSON } from './ejson.js';

export interface DumpManifest {
  version: 1;
  format: 'vast-dump-v1';
  createdAt: string;
  database: string;
  collections: string[];
  mongoVersion?: string;
}

export interface DumpResult {
  directory: string;
  collections: { name: string; count: number }[];
  manifest: DumpManifest;
}

export async function dumpDatabase(
  client: MongoClient,
  database: string,
  outDir: string,
  options: { collections?: string[] } = {},
): Promise<DumpResult> {
  mkdirSync(outDir, { recursive: true });
  const db = client.db(database);
  const all = await db.listCollections().toArray();
  let names = all.map((c) => c.name).filter((n) => !n.startsWith('system.'));
  if (options.collections?.length) {
    names = names.filter((n) => options.collections!.includes(n));
  }

  const collectionsMeta: { name: string; count: number }[] = [];
  for (const name of names) {
    const count = await dumpCollection(db, name, join(outDir, `${name}.jsonl.gz`));
    const indexes = await db.collection(name).indexes();
    writeFileSync(join(outDir, `${name}.indexes.json`), JSON.stringify(indexes, null, 2));
    collectionsMeta.push({ name, count });
  }

  let mongoVersion: string | undefined;
  try {
    const info = await client.db('admin').command({ buildInfo: 1 });
    mongoVersion = typeof info.version === 'string' ? info.version : undefined;
  } catch {
    // ignore
  }

  const manifest: DumpManifest = {
    version: 1,
    format: 'vast-dump-v1',
    createdAt: new Date().toISOString(),
    database,
    collections: names,
    mongoVersion,
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { directory: outDir, collections: collectionsMeta, manifest };
}

async function dumpCollection(db: Db, name: string, outPath: string): Promise<number> {
  const gzip = createGzip();
  const file = createWriteStream(outPath);
  gzip.pipe(file);
  let count = 0;
  const cursor = db.collection(name).find({});
  for await (const doc of cursor) {
    const ok = gzip.write(stringifyEJSON(doc) + '\n');
    count += 1;
    if (!ok) await new Promise((r) => gzip.once('drain', r));
  }
  await new Promise<void>((resolve, reject) => {
    gzip.end();
    file.on('finish', () => resolve());
    file.on('error', reject);
    gzip.on('error', reject);
  });
  return count;
}

export async function restoreDatabase(
  client: MongoClient,
  targetDatabase: string,
  dumpDir: string,
  options: { drop?: boolean } = {},
): Promise<{ collections: { name: string; inserted: number }[] }> {
  const manifestPath = join(dumpDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('manifest.json not found in dump directory');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DumpManifest;
  const db = client.db(targetDatabase);
  const results: { name: string; inserted: number }[] = [];

  for (const name of manifest.collections) {
    if (options.drop) {
      await db
        .collection(name)
        .drop()
        .catch(() => undefined);
    }
    const filePath = join(dumpDir, `${name}.jsonl.gz`);
    if (!existsSync(filePath)) continue;
    const inserted = await restoreCollection(db, name, filePath);
    const idxPath = join(dumpDir, `${name}.indexes.json`);
    if (existsSync(idxPath)) {
      const indexes = JSON.parse(readFileSync(idxPath, 'utf8')) as Document[];
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const key = idx.key as Document;
        const { key: _k, v: _v, ns: _ns, ...opts } = idx as Document & {
          key: Document;
          v?: number;
          ns?: string;
        };
        try {
          await db.collection(name).createIndex(key, opts as object);
        } catch {
          // index may already exist
        }
      }
    }
    results.push({ name, inserted });
  }
  return { collections: results };
}

async function restoreCollection(db: Db, name: string, filePath: string): Promise<number> {
  const input = createReadStream(filePath).pipe(createGunzip());
  const rl = createInterface({ input, crlfDelay: Infinity });
  let batch: Document[] = [];
  let inserted = 0;
  const col = db.collection(name);

  async function flush() {
    if (!batch.length) return;
    const result = await col.insertMany(batch, { ordered: false });
    inserted += result.insertedCount;
    batch = [];
  }

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    batch.push(parseEJSON(t) as Document);
    if (batch.length >= 500) await flush();
  }
  await flush();
  return inserted;
}
