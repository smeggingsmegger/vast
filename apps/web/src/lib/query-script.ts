/**
 * Mongosh-style query scripts for the collection query editor.
 * Supports chained find() for execution; other ops as templates.
 */

export type QueryKind =
  | 'find'
  | 'findOne'
  | 'count'
  | 'aggregate'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | 'insertOne'
  | 'insertMany'
  | 'unknown';

export interface ParsedFind {
  kind: 'find' | 'findOne' | 'count';
  collection?: string;
  filter: unknown;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  /** 0 or undefined means “use workbench default”. */
  limit?: number;
}

export interface ParsedAggregate {
  kind: 'aggregate';
  collection?: string;
  pipeline: unknown[];
}

export interface ParsedUpdate {
  kind: 'updateOne' | 'updateMany';
  collection?: string;
  filter: unknown;
  update: unknown;
  upsert?: boolean;
}

export interface ParsedDelete {
  kind: 'deleteOne' | 'deleteMany';
  collection?: string;
  filter: unknown;
}

export interface ParsedInsert {
  kind: 'insertOne';
  collection?: string;
  document: unknown;
}

export interface ParsedInsertMany {
  kind: 'insertMany';
  collection?: string;
  documents: unknown[];
}

export type ParsedScript =
  | ParsedFind
  | ParsedAggregate
  | ParsedUpdate
  | ParsedDelete
  | ParsedInsert
  | ParsedInsertMany
  | { kind: 'unknown'; raw: true };

export interface QueryTemplate {
  id: string;
  label: string;
  description: string;
  /** Whether Run can execute this against the API. */
  runnable: boolean;
  /** Whether Preview (match count + sample) applies. */
  previewable: boolean;
  group: 'read' | 'write' | 'pipeline';
  build: (col: string) => string;
}

/** Safe mongosh collection accessor. */
export function collectionRef(col: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) return `db.${col}`;
  return `db.getCollection(${JSON.stringify(col)})`;
}

export function defaultFindScript(col: string): string {
  return `${collectionRef(col)}.find({})
  .projection({})
  .sort({ _id: -1 })
  .limit(50)`;
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'find',
    label: 'find',
    description: 'Find documents (filter, sort, limit)',
    runnable: true,
    previewable: true,
    group: 'read',
    build: (col) => defaultFindScript(col),
  },
  {
    id: 'find-eq',
    label: 'find by field',
    description: 'Match a single field value',
    runnable: true,
    previewable: true,
    group: 'read',
    build: (col) =>
      `${collectionRef(col)}.find({ status: "active" })
  .sort({ _id: -1 })
  .limit(50)`,
  },
  {
    id: 'findOne',
    label: 'findOne',
    description: 'Return a single document',
    runnable: true,
    previewable: true,
    group: 'read',
    build: (col) => `${collectionRef(col)}.findOne({ _id: ObjectId("000000000000000000000000") })`,
  },
  {
    id: 'count',
    label: 'countDocuments',
    description: 'Count matching documents',
    runnable: true,
    previewable: true,
    group: 'read',
    build: (col) => `${collectionRef(col)}.countDocuments({})`,
  },
  {
    id: 'aggregate',
    label: 'aggregate',
    description: 'Aggregation pipeline',
    runnable: true,
    previewable: false,
    group: 'pipeline',
    build: (col) =>
      `${collectionRef(col)}.aggregate([
  { $match: {} },
  { $group: { _id: "$status", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 20 }
])`,
  },
  {
    id: 'updateOne',
    label: 'updateOne',
    description: 'Update one matching document',
    runnable: true,
    previewable: true,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.updateOne(
  { _id: ObjectId("000000000000000000000000") },
  { $set: { updatedAt: new Date() } }
)`,
  },
  {
    id: 'updateMany',
    label: 'updateMany',
    description: 'Update all matching documents',
    runnable: true,
    previewable: true,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.updateMany(
  { status: "pending" },
  { $set: { status: "done" }, $currentDate: { updatedAt: true } }
)`,
  },
  {
    id: 'deleteOne',
    label: 'deleteOne',
    description: 'Delete one matching document',
    runnable: true,
    previewable: true,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.deleteOne({ _id: ObjectId("000000000000000000000000") })`,
  },
  {
    id: 'deleteMany',
    label: 'deleteMany',
    description: 'Delete all matching documents',
    runnable: true,
    previewable: true,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.deleteMany({ status: "archived" })`,
  },
  {
    id: 'insertOne',
    label: 'insertOne',
    description: 'Insert a single document',
    runnable: true,
    previewable: false,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.insertOne({
  name: "example",
  createdAt: new Date()
})`,
  },
  {
    id: 'insertMany',
    label: 'insertMany',
    description: 'Insert multiple documents',
    runnable: true,
    previewable: false,
    group: 'write',
    build: (col) =>
      `${collectionRef(col)}.insertMany([
  { name: "a" },
  { name: "b" }
])`,
  },
];

/** Strip // and /* comments and normalize whitespace for parsing. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .trim();
}

/**
 * Lenient JSON-ish parse: allows unquoted ObjectId/Date tokens to be stringified away
 * by first normalizing common mongosh helpers into EJSON-ish placeholders.
 */
export function parseMongoJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  let s = trimmed;
  // ObjectId("hex") → { "$oid": "hex" }
  s = s.replace(/ObjectId\s*\(\s*["']([a-fA-F0-9]{24})["']\s*\)/g, '{"$oid":"$1"}');
  // ISODate / Date("...") → { "$date": "..." }
  s = s.replace(/(?:ISODate|Date)\s*\(\s*["']([^"']+)["']\s*\)/g, '{"$date":"$1"}');
  // new Date() → current ISO (static snapshot)
  s = s.replace(/new\s+Date\s*\(\s*\)/g, () => JSON.stringify({ $date: new Date().toISOString() }));
  // Trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Unquoted keys (simple identifiers, including $match etc.)
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  // Single quotes → double quotes (naive)
  s = s.replace(/'/g, '"');
  return JSON.parse(s);
}

function extractBalanced(src: string, openIdx: number): { content: string; end: number } | null {
  const open = src[openIdx];
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return { content: src.slice(openIdx + 1, i), end: i };
      }
    }
  }
  return null;
}

function detectKind(src: string): QueryKind {
  if (/\.findOne\s*\(/.test(src)) return 'findOne';
  if (/\.countDocuments\s*\(/.test(src) || /\.count\s*\(/.test(src)) return 'count';
  if (/\.aggregate\s*\(/.test(src)) return 'aggregate';
  if (/\.updateMany\s*\(/.test(src)) return 'updateMany';
  if (/\.updateOne\s*\(/.test(src)) return 'updateOne';
  if (/\.deleteMany\s*\(/.test(src)) return 'deleteMany';
  if (/\.deleteOne\s*\(/.test(src)) return 'deleteOne';
  if (/\.insertMany\s*\(/.test(src)) return 'insertMany';
  if (/\.insertOne\s*\(/.test(src)) return 'insertOne';
  if (/\.find\s*\(/.test(src)) return 'find';
  return 'unknown';
}

function extractCollection(src: string): string | undefined {
  const getCol = src.match(/db\.getCollection\s*\(\s*["']([^"']+)["']\s*\)/);
  if (getCol) return getCol[1];
  const dotted = src.match(/db\.([A-Za-z_][A-Za-z0-9_]*)\s*\./);
  if (dotted) return dotted[1];
  return undefined;
}

function parseChainedNumber(src: string, method: string): number | undefined {
  const re = new RegExp(`\\.${method}\\s*\\(\\s*(-?\\d+)\\s*\\)`);
  const m = src.match(re);
  if (!m) return undefined;
  return Number(m[1]);
}

function parseChainedObject(src: string, method: string): unknown | undefined {
  const re = new RegExp(`\\.${method}\\s*\\(`);
  const m = re.exec(src);
  if (!m || m.index === undefined) return undefined;
  const openIdx = m.index + m[0].length - 1;
  const bal = extractBalanced(src, openIdx);
  if (!bal) return undefined;
  try {
    return parseMongoJson(bal.content || '{}');
  } catch {
    return undefined;
  }
}

/**
 * Parse a script into an executable find / count / aggregate, or mark as template-only.
 */
export function parseQueryScript(script: string): ParsedScript {
  const src = stripComments(script);
  if (!src) {
    return { kind: 'find', filter: {} };
  }
  const kind = detectKind(src);
  const collection = extractCollection(src);

  if (kind === 'find' || kind === 'findOne' || kind === 'count') {
    const method =
      kind === 'findOne' ? 'findOne' : kind === 'count' ? (/\.countDocuments/.test(src) ? 'countDocuments' : 'count') : 'find';
    const callRe = new RegExp(`\\.${method}\\s*\\(`);
    const m = callRe.exec(src);
    let filter: unknown = {};
    let projection: Record<string, 0 | 1> | undefined;
    if (m && m.index !== undefined) {
      const openIdx = m.index + m[0].length - 1;
      const bal = extractBalanced(src, openIdx);
      if (bal) {
        const args = bal.content.trim();
        if (args) {
          // Split top-level args by comma (filter, projection)
          const parts = splitTopLevelArgs(args);
          try {
            filter = parts[0] ? parseMongoJson(parts[0]) : {};
          } catch {
            throw new Error(`Invalid filter JSON in ${method}()`);
          }
          if (parts[1]) {
            try {
              projection = parseMongoJson(parts[1]) as Record<string, 0 | 1>;
            } catch {
              throw new Error('Invalid projection JSON');
            }
          }
        }
      }
    }
    const chainedProj = parseChainedObject(src, 'projection') as Record<string, 0 | 1> | undefined;
    if (chainedProj && Object.keys(chainedProj).length) projection = chainedProj;
    const sort = parseChainedObject(src, 'sort') as Record<string, 1 | -1> | undefined;
    const skip = parseChainedNumber(src, 'skip');
    let limit = parseChainedNumber(src, 'limit');
    if (kind === 'findOne') limit = 1;
    return {
      kind,
      collection,
      filter,
      projection: projection && Object.keys(projection).length ? projection : undefined,
      sort: sort && Object.keys(sort).length ? sort : undefined,
      skip,
      limit,
    };
  }

  if (kind === 'aggregate') {
    const m = /\.aggregate\s*\(/.exec(src);
    if (!m || m.index === undefined) {
      return { kind: 'aggregate', collection, pipeline: [] };
    }
    const openIdx = m.index + m[0].length - 1;
    const bal = extractBalanced(src, openIdx);
    if (!bal) throw new Error('Unbalanced aggregate() arguments');
    try {
      const pipeline = parseMongoJson(bal.content.trim() || '[]');
      if (!Array.isArray(pipeline)) throw new Error('aggregate() expects an array pipeline');
      return { kind: 'aggregate', collection, pipeline };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Invalid aggregate pipeline');
    }
  }

  if (kind === 'updateOne' || kind === 'updateMany') {
    const method = kind;
    const m = new RegExp(`\\.${method}\\s*\\(`).exec(src);
    if (!m || m.index === undefined) throw new Error(`Could not parse ${method}()`);
    const bal = extractBalanced(src, m.index + m[0].length - 1);
    if (!bal) throw new Error(`Unbalanced ${method}() arguments`);
    const parts = splitTopLevelArgs(bal.content.trim());
    if (parts.length < 2) {
      throw new Error(`${method}(filter, update) requires two arguments`);
    }
    try {
      const filter = parseMongoJson(parts[0] || '{}');
      const update = parseMongoJson(parts[1] || '{}');
      let upsert = false;
      if (parts[2]) {
        try {
          const opts = parseMongoJson(parts[2]) as { upsert?: boolean };
          upsert = !!opts.upsert;
        } catch {
          // ignore options parse
        }
      }
      return { kind, collection, filter, update, upsert };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : `Invalid ${method}() arguments`);
    }
  }

  if (kind === 'deleteOne' || kind === 'deleteMany') {
    const method = kind;
    const m = new RegExp(`\\.${method}\\s*\\(`).exec(src);
    if (!m || m.index === undefined) throw new Error(`Could not parse ${method}()`);
    const bal = extractBalanced(src, m.index + m[0].length - 1);
    if (!bal) throw new Error(`Unbalanced ${method}() arguments`);
    try {
      const filter = parseMongoJson(bal.content.trim() || '{}');
      return { kind, collection, filter };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : `Invalid ${method}() filter`);
    }
  }

  if (kind === 'insertOne') {
    const m = /\.insertOne\s*\(/.exec(src);
    if (!m || m.index === undefined) throw new Error('Could not parse insertOne()');
    const bal = extractBalanced(src, m.index + m[0].length - 1);
    if (!bal) throw new Error('Unbalanced insertOne() arguments');
    try {
      const document = parseMongoJson(bal.content.trim() || '{}');
      return { kind: 'insertOne', collection, document };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Invalid insertOne() document');
    }
  }

  if (kind === 'insertMany') {
    const m = /\.insertMany\s*\(/.exec(src);
    if (!m || m.index === undefined) throw new Error('Could not parse insertMany()');
    const bal = extractBalanced(src, m.index + m[0].length - 1);
    if (!bal) throw new Error('Unbalanced insertMany() arguments');
    try {
      const documents = parseMongoJson(bal.content.trim() || '[]');
      if (!Array.isArray(documents)) throw new Error('insertMany() expects an array');
      return { kind: 'insertMany', collection, documents };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Invalid insertMany() documents');
    }
  }

  return { kind: 'unknown', raw: true };
}

/** Filter used for preview/match-count (writes use their filter; inserts N/A). */
export function filterFromParsed(parsed: ParsedScript): unknown | null {
  if (
    parsed.kind === 'find' ||
    parsed.kind === 'findOne' ||
    parsed.kind === 'count' ||
    parsed.kind === 'updateOne' ||
    parsed.kind === 'updateMany' ||
    parsed.kind === 'deleteOne' ||
    parsed.kind === 'deleteMany'
  ) {
    return 'filter' in parsed ? parsed.filter : {};
  }
  return null;
}

export function isWriteOp(kind: QueryKind): boolean {
  return (
    kind === 'updateOne' ||
    kind === 'updateMany' ||
    kind === 'deleteOne' ||
    kind === 'deleteMany' ||
    kind === 'insertOne' ||
    kind === 'insertMany'
  );
}

export function isPreviewable(parsed: ParsedScript): boolean {
  return (
    parsed.kind === 'find' ||
    parsed.kind === 'findOne' ||
    parsed.kind === 'count' ||
    parsed.kind === 'updateOne' ||
    parsed.kind === 'updateMany' ||
    parsed.kind === 'deleteOne' ||
    parsed.kind === 'deleteMany'
  );
}

function splitTopLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = args.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

export function isRunnable(
  parsed: ParsedScript,
): parsed is Exclude<ParsedScript, { kind: 'unknown'; raw: true }> {
  return parsed.kind !== 'unknown' && !('raw' in parsed && parsed.raw);
}

// ── Visual builder ↔ script ──────────────────────────────────────────

export type BuilderOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'exists' | 'in';

export interface BuilderCondition {
  id: string;
  field: string;
  op: BuilderOp;
  value: string;
}

export interface FindBuilderState {
  conditions: BuilderCondition[];
  sortField: string;
  sortDir: 1 | -1;
  skip: number;
  limit: number;
}

export function emptyBuilderState(): FindBuilderState {
  return {
    conditions: [{ id: cryptoRandomId(), field: '', op: 'eq', value: '' }],
    sortField: '_id',
    sortDir: -1,
    skip: 0,
    limit: 50,
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

export function newCondition(): BuilderCondition {
  return { id: cryptoRandomId(), field: '', op: 'eq', value: '' };
}

function coerceValue(raw: string): unknown {
  const v = raw.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      return parseMongoJson(v);
    } catch {
      return v;
    }
  }
  // ObjectId hex
  if (/^[a-fA-F0-9]{24}$/.test(v)) return { $oid: v };
  return v;
}

export function builderToFilter(state: FindBuilderState): unknown {
  const clauses: Record<string, unknown>[] = [];
  for (const c of state.conditions) {
    if (!c.field.trim()) continue;
    const field = c.field.trim();
    if (c.op === 'eq') {
      clauses.push({ [field]: coerceValue(c.value) });
    } else if (c.op === 'exists') {
      clauses.push({ [field]: { $exists: c.value !== 'false' } });
    } else if (c.op === 'in') {
      const parts = c.value.split(',').map((s) => coerceValue(s.trim()));
      clauses.push({ [field]: { $in: parts } });
    } else if (c.op === 'regex') {
      clauses.push({ [field]: { $regex: c.value, $options: 'i' } });
    } else {
      clauses.push({ [field]: { [`$${c.op}`]: coerceValue(c.value) } });
    }
  }
  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

/** Convert visual builder state into a mongosh-style find script. */
export function findBuilderToScript(col: string, state: FindBuilderState): string {
  const filter = builderToFilter(state);
  const lines = [`${collectionRef(col)}.find(${prettyJson(filter)})`, '  .projection({})'];
  if (state.sortField.trim()) {
    const f = state.sortField.trim();
    const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(f) ? f : JSON.stringify(f);
    lines.push(`  .sort({ ${key}: ${state.sortDir} })`);
  }
  if (state.skip > 0) lines.push(`  .skip(${state.skip})`);
  lines.push(`  .limit(${state.limit > 0 ? state.limit : 50})`);
  return lines.join('\n');
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return '{}';
  }
}

/**
 * Best-effort reverse: pull simple find script into builder state.
 * Falls back to empty builder if structure is too complex.
 */
export function scriptToBuilder(script: string): FindBuilderState | null {
  try {
    const parsed = parseQueryScript(script);
    if (parsed.kind !== 'find' && parsed.kind !== 'findOne' && parsed.kind !== 'count') return null;
    if (!('filter' in parsed)) return null;
    const filter = parsed.filter;
    const conditions: BuilderCondition[] = [];

    const addFromObj = (obj: Record<string, unknown>) => {
      for (const [field, val] of Object.entries(obj)) {
        if (field.startsWith('$')) return false;
        if (val !== null && typeof val === 'object' && !Array.isArray(val) && !('$oid' in val) && !('$date' in val)) {
          const ops = Object.keys(val as object);
          if (ops.length === 1 && ops[0].startsWith('$')) {
            const op = ops[0].slice(1) as BuilderOp;
            const inner = (val as Record<string, unknown>)[ops[0]];
            if (op === 'regex') {
              conditions.push({
                id: cryptoRandomId(),
                field,
                op: 'regex',
                value: String(inner),
              });
            } else if (op === 'exists') {
              conditions.push({
                id: cryptoRandomId(),
                field,
                op: 'exists',
                value: inner ? 'true' : 'false',
              });
            } else if (op === 'in' && Array.isArray(inner)) {
              conditions.push({
                id: cryptoRandomId(),
                field,
                op: 'in',
                value: inner.map((x) => formatBuilderValue(x)).join(', '),
              });
            } else if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(op)) {
              conditions.push({
                id: cryptoRandomId(),
                field,
                op: op as BuilderOp,
                value: formatBuilderValue(inner),
              });
            } else {
              return false;
            }
            continue;
          }
          return false;
        }
        conditions.push({
          id: cryptoRandomId(),
          field,
          op: 'eq',
          value: formatBuilderValue(val),
        });
      }
      return true;
    };

    if (filter && typeof filter === 'object' && !Array.isArray(filter)) {
      const f = filter as Record<string, unknown>;
      if (Array.isArray(f.$and)) {
        for (const clause of f.$and) {
          if (!clause || typeof clause !== 'object') return null;
          if (!addFromObj(clause as Record<string, unknown>)) return null;
        }
      } else if (Object.keys(f).length === 0) {
        // empty
      } else {
        if (!addFromObj(f)) return null;
      }
    }

    let sortField = '_id';
    let sortDir: 1 | -1 = -1;
    if (parsed.sort) {
      const entries = Object.entries(parsed.sort);
      if (entries.length === 1) {
        sortField = entries[0][0];
        sortDir = entries[0][1] === -1 ? -1 : 1;
      }
    }

    return {
      conditions: conditions.length ? conditions : [newCondition()],
      sortField,
      sortDir,
      skip: parsed.skip ?? 0,
      limit: parsed.limit && parsed.limit > 0 ? parsed.limit : 50,
    };
  } catch {
    return null;
  }
}

function formatBuilderValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && '$oid' in v) return String((v as { $oid: string }).$oid);
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const BUILDER_OPS: { value: BuilderOp; label: string }[] = [
  { value: 'eq', label: 'equals' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'regex', label: 'contains' },
  { value: 'in', label: 'in list' },
  { value: 'exists', label: 'exists' },
];
