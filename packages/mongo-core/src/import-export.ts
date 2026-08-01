import type { Collection, Document } from 'mongodb';
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { Readable, Transform, Writable } from 'node:stream';
import { fromEJSON, stringifyEJSON, parseEJSON, toEJSON } from './ejson.js';
import { ErrorCode, VastError } from '@vast/shared';

export interface ImportResult {
  insertedCount: number;
  errorCount: number;
  errors: { line: number; message: string }[];
}

export async function importJsonl(
  collection: Collection<Document>,
  input: Readable,
  options: { batchSize?: number; maxErrors?: number } = {},
): Promise<ImportResult> {
  const batchSize = options.batchSize ?? 500;
  const maxErrors = options.maxErrors ?? 100;
  const rl = createInterface({ input, crlfDelay: Infinity });
  let batch: Document[] = [];
  let insertedCount = 0;
  let errorCount = 0;
  const errors: { line: number; message: string }[] = [];
  let lineNo = 0;

  async function flush() {
    if (!batch.length) return;
    const toInsert = batch;
    batch = [];
    try {
      const result = await collection.insertMany(toInsert, { ordered: false });
      insertedCount += result.insertedCount;
    } catch (err) {
      // bulk write may partially succeed
      const anyErr = err as { result?: { nInserted?: number }; message?: string };
      if (typeof anyErr.result?.nInserted === 'number') {
        insertedCount += anyErr.result.nInserted;
      }
      errorCount += 1;
      if (errors.length < maxErrors) {
        errors.push({ line: lineNo, message: anyErr.message ?? 'insertMany failed' });
      }
    }
  }

  for await (const line of rl) {
    lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const doc = parseEJSON(trimmed) as Document;
      batch.push(doc);
      if (batch.length >= batchSize) await flush();
    } catch (err) {
      errorCount += 1;
      if (errors.length < maxErrors) {
        errors.push({
          line: lineNo,
          message: err instanceof Error ? err.message : 'parse error',
        });
      }
    }
  }
  await flush();
  return { insertedCount, errorCount, errors };
}

export async function importJsonArray(
  collection: Collection<Document>,
  text: string,
): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VastError(ErrorCode.VALIDATION, 'Invalid JSON array');
  }
  if (!Array.isArray(parsed)) {
    throw new VastError(ErrorCode.VALIDATION, 'Expected a JSON array of documents');
  }
  const docs = parsed.map((d) => fromEJSON(d) as Document);
  if (!docs.length) return { insertedCount: 0, errorCount: 0, errors: [] };
  const result = await collection.insertMany(docs, { ordered: false });
  return { insertedCount: result.insertedCount, errorCount: 0, errors: [] };
}

export async function exportJsonl(
  collection: Collection<Document>,
  filter: Document = {},
  outPath: string,
  options: { gzip?: boolean; limit?: number } = {},
): Promise<{ count: number }> {
  const cursor = collection.find(filter).limit(options.limit ?? 0);
  let count = 0;
  const file = createWriteStream(outPath);
  const dest: Writable = options.gzip ? createGzip() : file;
  if (options.gzip) {
    dest.pipe(file);
  }

  await new Promise<void>((resolve, reject) => {
    const writeLine = (line: string) =>
      new Promise<void>((res, rej) => {
        const ok = dest.write(line + '\n');
        if (ok) res();
        else dest.once('drain', () => res());
        dest.once('error', rej);
      });

    (async () => {
      try {
        for await (const doc of cursor) {
          await writeLine(stringifyEJSON(doc));
          count += 1;
        }
        dest.end();
        file.on('finish', () => resolve());
        if (!options.gzip) resolve();
      } catch (e) {
        reject(e);
      }
    })().catch(reject);
  });

  return { count };
}

export async function exportJsonlToString(
  collection: Collection<Document>,
  filter: Document = {},
  limit = 10_000,
): Promise<{ text: string; count: number }> {
  const docs = await collection.find(filter).limit(limit).toArray();
  const lines = docs.map((d) => stringifyEJSON(d));
  return { text: lines.join('\n') + (lines.length ? '\n' : ''), count: docs.length };
}

export async function exportJsonArrayString(
  collection: Collection<Document>,
  filter: Document = {},
  limit = 10_000,
): Promise<{ text: string; count: number }> {
  const docs = await collection.find(filter).limit(limit).toArray();
  const ejson = docs.map((d) => toEJSON(d));
  return { text: JSON.stringify(ejson, null, 2), count: docs.length };
}

/** CSV: flatten top-level fields only */
export async function exportCsvString(
  collection: Collection<Document>,
  filter: Document = {},
  limit = 10_000,
): Promise<{ text: string; count: number }> {
  const docs = await collection.find(filter).limit(limit).toArray();
  if (!docs.length) return { text: '', count: 0 };
  const keys = new Set<string>();
  for (const d of docs) {
    for (const k of Object.keys(d)) keys.add(k);
  }
  const header = [...keys];
  const lines = [header.map(csvEscape).join(',')];
  for (const d of docs) {
    lines.push(
      header
        .map((k) => {
          const v = d[k];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return csvEscape(JSON.stringify(toEJSON(v)));
          return csvEscape(String(v));
        })
        .join(','),
    );
  }
  return { text: lines.join('\n') + '\n', count: docs.length };
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function readJsonlFile(path: string, gzip = false): Promise<Readable> {
  const stream = createReadStream(path);
  return gzip ? stream.pipe(createGunzip()) : stream;
}

// silence unused import in some bundlers
void pipeline;
void Transform;
