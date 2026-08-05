/**
 * Mongosh-like script runner for a single database.
 *
 * Exposes a sandboxed `db` proxy (collections + common helpers) and evaluates
 * multi-statement scripts with auto-await of Promises / cursors so scripts
 * written for mongosh (without explicit await) mostly work.
 *
 * Does NOT grant Node/fs/network access — only the MongoDB driver via `db`.
 */
import vm from 'node:vm';
import {
  ObjectId,
  Long,
  Decimal128,
  type Db,
  type Document,
  type Filter,
  type FindOptions,
} from 'mongodb';
import { ErrorCode, VastError } from '@vast/shared';
import { fromEJSON, toEJSON } from './ejson.js';

const MAX_RESULT_DOCS = 5_000;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Cross-realm safe (vm scripts create RegExp/Date in a different realm). */
function isRegExp(value: unknown): value is RegExp {
  return Object.prototype.toString.call(value) === '[object RegExp]';
}

function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/**
 * Convert values from the shell VM into driver-ready BSON.
 * Keeps native RegExp/Date/ObjectId/Long; expands EJSON shapes.
 * Note: `instanceof RegExp` fails for literals from `vm` contexts — use toString tags.
 */
function toBson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // Re-box into the host realm so the Mongo driver accepts them
  if (isRegExp(value)) return new RegExp(value.source, value.flags);
  if (isDate(value)) return new Date(value.getTime());
  if (value instanceof ObjectId) return value;
  if (Long.isLong(value)) return value;
  if (value instanceof Decimal128) return value;
  if (Array.isArray(value)) return value.map(toBson);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // Canonical EJSON type wrappers
    if (
      '$oid' in o ||
      '$date' in o ||
      '$numberLong' in o ||
      '$numberInt' in o ||
      '$numberDouble' in o ||
      '$numberDecimal' in o ||
      '$binary' in o
    ) {
      return fromEJSON(value);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = toBson(v);
    return out;
  }
  return value;
}

export interface ShellStatementResult {
  /** 0-based statement index */
  index: number;
  /** Source snippet (trimmed, truncated) */
  statement: string;
  /** EJSON value (omitted on error) */
  value?: unknown;
  error?: string;
  /** true when value was produced (including undefined) */
  hasValue: boolean;
}

export interface ShellRunResult {
  results: ShellStatementResult[];
  executionMs: number;
}

export interface ShellRunOptions {
  maxTimeMS?: number;
  readOnly?: boolean;
  /** Max documents materialised from a cursor (default 5000) */
  maxDocs?: number;
}

/** Strip // and /* comments carefully enough for statement splitting. */
export function stripShellComments(src: string): string {
  let out = '';
  let i = 0;
  let inS: '"' | "'" | '`' | null = null;
  let escape = false;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (inS) {
      out += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\' && inS !== '`') {
        escape = true;
      } else if (ch === inS) {
        inS = null;
      } else if (inS === '`' && ch === '\\') {
        escape = true;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Split script into statements at top-level `;` or newlines that end an expression.
 * Keeps braces/parens/brackets balanced; respects strings.
 */
export function splitShellStatements(src: string): string[] {
  const cleaned = stripShellComments(src);
  const statements: string[] = [];
  let cur = '';
  let depth = 0;
  let inS: '"' | "'" | '`' | null = null;
  let escape = false;

  const push = () => {
    const t = cur.trim();
    if (t) statements.push(t);
    cur = '';
  };

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]!;
    if (inS) {
      cur += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inS) {
        inS = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inS = ch;
      cur += ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      cur += ch;
      continue;
    }
    if (ch === ';' && depth === 0) {
      push();
      continue;
    }
    // Newline at depth 0 ends a statement if current buffer looks complete
    // (not ending with operator / open keyword glue). Always treat blank line as split.
    if (ch === '\n' && depth === 0) {
      const trimmed = cur.trimEnd();
      if (!trimmed) {
        cur = '';
        continue;
      }
      // Continue statement if ends with binary-ish token
      if (/[,.+\-*/%&|?<>=!]$/.test(trimmed)) {
        cur += ch;
        continue;
      }
      // Continue after keywords that need a body
      if (/\b(return|throw|else|of|in|do|try|catch|finally|await)\s*$/i.test(trimmed)) {
        cur += ch;
        continue;
      }
      push();
      continue;
    }
    cur += ch;
  }
  push();
  return statements;
}

/**
 * Mongosh-style thenable: await for value; `.method(args)` chains after resolve;
 * bare `.prop` (e.g. `.length`) resolves to the property when awaited.
 */
function thenableChain(promise: Promise<unknown>): unknown {
  const p = Promise.resolve(promise);
  return new Proxy(function () {} as unknown as object, {
    get(_t, prop) {
      if (prop === 'then') return p.then.bind(p);
      if (prop === 'catch') return p.catch.bind(p);
      if (prop === 'finally') return (p.finally ? p.finally.bind(p) : undefined) as unknown;
      if (prop === Symbol.toStringTag) return 'Promise';
      // Property that may be a method or a value (cross-realm safe)
      const propPromise = p.then((val) => {
        if (val == null) return val;
        return (val as Record<string | symbol, unknown>)[prop];
      });
      return new Proxy(function () {} as unknown as object, {
        get(_t2, next) {
          if (next === 'then') return propPromise.then.bind(propPromise);
          if (next === 'catch') return propPromise.catch.bind(propPromise);
          if (next === 'finally') {
            return propPromise.finally ? propPromise.finally.bind(propPromise) : undefined;
          }
          if (next === Symbol.toStringTag) return 'Promise';
          // deeper chain: resolvedProp.next...
          return thenableChain(
            propPromise.then((v) => {
              if (v == null) return v;
              const n = (v as Record<string | symbol, unknown>)[next];
              return n;
            }),
          );
        },
        apply(_t2, _this, args) {
          return thenableChain(
            p.then((val) => {
              if (val == null) return val;
              const v = (val as Record<string | symbol, unknown>)[prop];
              if (typeof v === 'function') {
                return (v as (...a: unknown[]) => unknown).apply(val, args);
              }
              return v;
            }),
          );
        },
      });
    },
    apply(_t, _this, args) {
      return thenableChain(
        p.then((val) => (typeof val === 'function' ? (val as (...a: unknown[]) => unknown)(...args) : val)),
      );
    },
  });
}

async function materialize(value: unknown, maxDocs: number): Promise<unknown> {
  let v = value;
  // Unwrap thenables / promises (including our Proxy)
  for (let i = 0; i < 20; i++) {
    if (v && typeof (v as Promise<unknown>).then === 'function') {
      v = await (v as Promise<unknown>);
      continue;
    }
    break;
  }
  // Cursor-like
  if (v && typeof (v as { toArray?: unknown }).toArray === 'function') {
    const arr = await (v as { toArray: () => Promise<unknown[]> }).toArray();
    if (arr.length > maxDocs) {
      return {
        __vastTruncated: true,
        returned: maxDocs,
        totalApprox: arr.length,
        data: arr.slice(0, maxDocs).map((d) => toEJSON(d)),
      };
    }
    return toEJSON(arr);
  }
  return toEJSON(v);
}

class ShellCursor {
  private cursor: {
    limit: (n: number) => unknown;
    skip: (n: number) => unknown;
    sort: (s: Document) => unknown;
    project: (p: Document) => unknown;
    maxTimeMS: (n: number) => unknown;
    toArray: () => Promise<Document[]>;
  };

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursor: any,
    private readonly maxDocs: number,
    maxTimeMS: number,
  ) {
    this.cursor = cursor;
    try {
      this.cursor.maxTimeMS(maxTimeMS);
    } catch {
      // ignore
    }
  }

  limit(n: number) {
    this.cursor = this.cursor.limit(n) as typeof this.cursor;
    return this;
  }
  skip(n: number) {
    this.cursor = this.cursor.skip(n) as typeof this.cursor;
    return this;
  }
  sort(s: Document) {
    this.cursor = this.cursor.sort(toBson(s) as Document) as typeof this.cursor;
    return this;
  }
  project(p: Document) {
    this.cursor = this.cursor.project(toBson(p) as Document) as typeof this.cursor;
    return this;
  }
  projection(p: Document) {
    return this.project(p);
  }

  async toArray(): Promise<unknown> {
    // Cap how many docs we pull even if the user did not limit()
    try {
      this.cursor = this.cursor.limit(this.maxDocs + 1) as typeof this.cursor;
    } catch {
      // ignore if already closed / limited oddly
    }
    const docs = await this.cursor.toArray();
    const truncated = docs.length > this.maxDocs;
    const slice = truncated ? docs.slice(0, this.maxDocs) : docs;
    const data = slice.map((d) => toEJSON(d));
    if (truncated) {
      return { __vastTruncated: true, returned: this.maxDocs, data };
    }
    return data;
  }

  // Allow await cursor → toArray
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.toArray().then(onfulfilled, onrejected);
  }
}

function createCollectionHandle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  col: any,
  opts: { readOnly: boolean; maxDocs: number; maxTimeMS: number },
) {
  const { readOnly, maxDocs, maxTimeMS } = opts;
  const denyWrite = () => {
    if (readOnly) throw new VastError(ErrorCode.READ_ONLY, 'Connection is read-only');
  };

  return {
    find(filter: unknown = {}, projection?: Document) {
      const f = (toBson(filter ?? {}) ?? {}) as Filter<Document>;
      const findOpts: FindOptions = {};
      if (projection) findOpts.projection = toBson(projection) as Document;
      const cursor = col.find(f, findOpts);
      return new ShellCursor(cursor, maxDocs, maxTimeMS);
    },
    findOne(filter: unknown = {}, projection?: Document) {
      const f = (toBson(filter ?? {}) ?? {}) as Filter<Document>;
      const findOpts: FindOptions = { maxTimeMS };
      if (projection) findOpts.projection = toBson(projection) as Document;
      return thenableChain(
        col.findOne(f, findOpts).then((d: Document | null) => (d ? toEJSON(d) : null)),
      );
    },
    countDocuments(filter: unknown = {}) {
      const f = (toBson(filter ?? {}) ?? {}) as Filter<Document>;
      return thenableChain(col.countDocuments(f, { maxTimeMS }));
    },
    estimatedDocumentCount() {
      return thenableChain(col.estimatedDocumentCount());
    },
    getIndexes() {
      return thenableChain(
        col.indexes().then((ix: Document[]) => ix.map((i) => toEJSON(i))),
      );
    },
    aggregate(pipeline: unknown[] = []) {
      const p = (toBson(pipeline) as Document[]) ?? [];
      const cursor = col.aggregate(p, { maxTimeMS, allowDiskUse: true });
      return new ShellCursor(cursor, maxDocs, maxTimeMS);
    },
    insertOne(doc: unknown) {
      denyWrite();
      return thenableChain(
        col.insertOne(toBson(doc) as Document).then((r: { insertedId: unknown }) =>
          toEJSON({ acknowledged: true, insertedId: r.insertedId }),
        ),
      );
    },
    insertMany(docs: unknown[]) {
      denyWrite();
      return thenableChain(
        col
          .insertMany((toBson(docs) as Document[]) ?? [], { ordered: false })
          .then((r: { insertedCount: number }) =>
            toEJSON({ acknowledged: true, insertedCount: r.insertedCount }),
          ),
      );
    },
    updateOne(filter: unknown, update: unknown, options?: Document) {
      denyWrite();
      return thenableChain(
        col
          .updateOne(
            toBson(filter) as Filter<Document>,
            toBson(update) as Document,
            (options as object) ?? {},
          )
          .then((r: { matchedCount: number; modifiedCount: number; upsertedCount?: number }) =>
            toEJSON({
              acknowledged: true,
              matchedCount: r.matchedCount,
              modifiedCount: r.modifiedCount,
              upsertedCount: r.upsertedCount ?? 0,
            }),
          ),
      );
    },
    updateMany(filter: unknown, update: unknown, options?: Document) {
      denyWrite();
      return thenableChain(
        col
          .updateMany(
            toBson(filter) as Filter<Document>,
            toBson(update) as Document,
            (options as object) ?? {},
          )
          .then((r: { matchedCount: number; modifiedCount: number }) =>
            toEJSON({
              acknowledged: true,
              matchedCount: r.matchedCount,
              modifiedCount: r.modifiedCount,
            }),
          ),
      );
    },
    deleteOne(filter: unknown) {
      denyWrite();
      return thenableChain(
        col
          .deleteOne(toBson(filter) as Filter<Document>)
          .then((r: { deletedCount: number }) =>
            toEJSON({ acknowledged: true, deletedCount: r.deletedCount }),
          ),
      );
    },
    deleteMany(filter: unknown) {
      denyWrite();
      return thenableChain(
        col
          .deleteMany(toBson(filter) as Filter<Document>)
          .then((r: { deletedCount: number }) =>
            toEJSON({ acknowledged: true, deletedCount: r.deletedCount }),
          ),
      );
    },
    distinct(field: string, filter: unknown = {}) {
      return thenableChain(
        col
          .distinct(field, toBson(filter) as Filter<Document>)
          .then((v: unknown[]) => toEJSON(v)),
      );
    },
  };
}

function createDbProxy(
  database: Db,
  opts: { readOnly: boolean; maxDocs: number; maxTimeMS: number },
) {
  const cache = new Map<string, ReturnType<typeof createCollectionHandle>>();
  const getCol = (name: string) => {
    let h = cache.get(name);
    if (!h) {
      h = createCollectionHandle(database.collection(name), opts);
      cache.set(name, h);
    }
    return h;
  };

  return new Proxy(
    {
      getCollection(name: string) {
        if (!name || typeof name !== 'string') {
          throw new VastError(ErrorCode.VALIDATION, 'getCollection requires a name');
        }
        return getCol(name);
      },
      getName() {
        return database.databaseName;
      },
      async adminCommand(_cmd: Document) {
        // Intentionally not exposing arbitrary admin on server — keep scoped
        throw new VastError(
          ErrorCode.VALIDATION,
          'adminCommand is not available in Vast shell (use the app UI for admin ops)',
        );
      },
    },
    {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        if (prop in target) return Reflect.get(target, prop, receiver);
        // db.collectionName → collection handle
        if (prop === 'then') return undefined; // not a thenable
        return getCol(String(prop));
      },
    },
  );
}

function isDeclarationOrControl(stmt: string): boolean {
  return /^(const|let|var|if|for|while|switch|try|class|function|async\s+function|return|throw|do)\b/.test(
    stmt,
  );
}

/**
 * Evaluate a multi-statement shell script against `database`.
 */
export async function runShellScript(
  database: Db,
  script: string,
  options: ShellRunOptions = {},
): Promise<ShellRunResult> {
  const maxTimeMS = options.maxTimeMS ?? DEFAULT_TIMEOUT_MS;
  const maxDocs = Math.min(options.maxDocs ?? MAX_RESULT_DOCS, MAX_RESULT_DOCS);
  const readOnly = options.readOnly ?? false;
  const started = Date.now();

  if (!script || !script.trim()) {
    throw new VastError(ErrorCode.VALIDATION, 'Script is empty');
  }

  const statements = splitShellStatements(script);
  if (statements.length === 0) {
    throw new VastError(ErrorCode.VALIDATION, 'No executable statements in script');
  }
  if (statements.length > 200) {
    throw new VastError(ErrorCode.VALIDATION, 'Too many statements (max 200)');
  }

  const results: ShellStatementResult[] = [];
  const prints: unknown[] = [];

  const db = createDbProxy(database, { readOnly, maxDocs, maxTimeMS });

  const contextObj: Record<string, unknown> = {
    db,
    ObjectId: (id?: string) => (id ? new ObjectId(id) : new ObjectId()),
    ISODate: (s?: string) => (s ? new Date(s) : new Date()),
    Date,
    NumberLong: (s: string | number) =>
      typeof s === 'number' ? Long.fromNumber(s) : Long.fromString(String(s)),
    NumberInt: (s: string | number) => Number.parseInt(String(s), 10),
    NumberDecimal: (s: string | number) => Decimal128.fromString(String(s)),
    print: (...args: unknown[]) => {
      prints.push(args.length === 1 ? args[0] : args);
    },
    printjson: (v: unknown) => {
      prints.push(v);
    },
    console: {
      log: (...args: unknown[]) => {
        prints.push(args.length === 1 ? args[0] : args);
      },
    },
    // Common globals
    JSON,
    Math,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };

  const context = vm.createContext(contextObj, {
    name: 'vast-shell',
  });

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!;
    const snippet = stmt.length > 200 ? stmt.slice(0, 200) + '…' : stmt;
    try {
      let value: unknown;
      if (isDeclarationOrControl(stmt)) {
        // Run as statement; capture assigned identifiers into context via rewriting const/let/var
        const assign = stmt.match(/^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/);
        if (assign) {
          const expr = assign[3]!.replace(/;?\s*$/, '');
          const script = new vm.Script(`(${expr})`, { filename: `shell-stmt-${i}.js` });
          value = script.runInContext(context, { timeout: Math.min(maxTimeMS, 30_000) });
          value = await materialize(value, maxDocs);
          contextObj[assign[2]!] = value;
          // Also put on context global
          (context as unknown as Record<string, unknown>)[assign[2]!] = value;
        } else {
          const script = new vm.Script(stmt, { filename: `shell-stmt-${i}.js` });
          value = script.runInContext(context, { timeout: Math.min(maxTimeMS, 30_000) });
          value = await materialize(value, maxDocs);
        }
      } else {
        const expr = stmt.replace(/;?\s*$/, '');
        const script = new vm.Script(`(${expr})`, { filename: `shell-expr-${i}.js` });
        value = script.runInContext(context, { timeout: Math.min(maxTimeMS, 30_000) });
        value = await materialize(value, maxDocs);
      }

      // Flush prints into results as we go
      while (prints.length) {
        const p = prints.shift();
        results.push({
          index: i,
          statement: `print()`,
          value: toEJSON(p),
          hasValue: true,
        });
      }

      // Skip pure undefined from control-flow-only statements unless useful
      if (value !== undefined) {
        results.push({
          index: i,
          statement: snippet,
          value,
          hasValue: true,
        });
      } else if (!isDeclarationOrControl(stmt) || /^(const|let|var)\s/.test(stmt)) {
        // still record declarations that assigned undefined? skip noise
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        index: i,
        statement: snippet,
        error: message,
        hasValue: false,
      });
      // Stop on first error (like a shell would after throw)
      break;
    }
  }

  // leftover prints
  while (prints.length) {
    const p = prints.shift();
    results.push({
      index: statements.length,
      statement: 'print()',
      value: toEJSON(p),
      hasValue: true,
    });
  }

  return { results, executionMs: Date.now() - started };
}
