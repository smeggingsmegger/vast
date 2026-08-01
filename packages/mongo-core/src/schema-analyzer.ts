export interface FieldTypeStat {
  type: string;
  count: number;
  samples: unknown[];
}

export interface FieldSchemaNode {
  path: string;
  presence: number;
  count: number;
  types: FieldTypeStat[];
  children?: FieldSchemaNode[];
}

export interface SchemaAnalysisResult {
  sampleSize: number;
  fields: FieldSchemaNode[];
}

const MAX_DEPTH = 32;
const MAX_SAMPLES = 5;

function bsonTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object') {
    const ctor = (value as { _bsontype?: string; constructor?: { name?: string } })._bsontype
      ?? (value as { constructor?: { name?: string } }).constructor?.name;
    if (ctor === 'ObjectId' || ctor === 'ObjectID') return 'objectId';
    if (ctor === 'Long') return 'long';
    if (ctor === 'Double') return 'double';
    if (ctor === 'Int32') return 'int';
    if (ctor === 'Decimal128') return 'decimal';
    if (ctor === 'Binary') return 'binary';
    if (ctor === 'Timestamp') return 'timestamp';
    if (ctor === 'MinKey') return 'minKey';
    if (ctor === 'MaxKey') return 'maxKey';
    if (ctor === 'Code') return 'code';
    if (ctor === 'BSONRegExp' || ctor === 'RegExp') return 'regex';
    return 'object';
  }
  return typeof value;
}

interface Acc {
  count: number;
  types: Map<string, { count: number; samples: unknown[] }>;
  children: Map<string, Acc>;
}

function newAcc(): Acc {
  return { count: 0, types: new Map(), children: new Map() };
}

function walk(value: unknown, accRoot: Map<string, Acc>, prefix: string, depth: number): void {
  if (depth > MAX_DEPTH) return;
  if (value === null || value === undefined) {
    touch(accRoot, prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    touch(accRoot, prefix, value);
    for (const item of value.slice(0, 20)) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
        walkObject(item as Record<string, unknown>, accRoot, prefix, depth + 1);
      }
    }
    return;
  }
  if (typeof value === 'object' && !(value instanceof Date) && !isBsonPrimitive(value)) {
    touch(accRoot, prefix, value);
    walkObject(value as Record<string, unknown>, accRoot, prefix, depth + 1);
    return;
  }
  touch(accRoot, prefix, value);
}

function isBsonPrimitive(value: object): boolean {
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  return [
    'ObjectId',
    'ObjectID',
    'Long',
    'Double',
    'Int32',
    'Decimal128',
    'Binary',
    'Timestamp',
    'MinKey',
    'MaxKey',
    'Code',
    'BSONRegExp',
  ].includes(name ?? '');
}

function walkObject(
  obj: Record<string, unknown>,
  accRoot: Map<string, Acc>,
  prefix: string,
  depth: number,
): void {
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    walk(val, accRoot, path, depth);
  }
}

function touch(accRoot: Map<string, Acc>, path: string, value: unknown): void {
  if (!path) return;
  let acc = accRoot.get(path);
  if (!acc) {
    acc = newAcc();
    accRoot.set(path, acc);
  }
  acc.count += 1;
  const t = bsonTypeName(value);
  let ts = acc.types.get(t);
  if (!ts) {
    ts = { count: 0, samples: [] };
    acc.types.set(t, ts);
  }
  ts.count += 1;
  if (ts.samples.length < MAX_SAMPLES) {
    ts.samples.push(sampleValue(value));
  }
}

function sampleValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    if (name === 'ObjectId' || name === 'ObjectID') {
      return String((value as { toHexString?: () => string }).toHexString?.() ?? value);
    }
    if (typeof (value as { toString: () => string }).toString === 'function' && name !== 'Object') {
      return String(value);
    }
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    return '[Object]';
  }
  if (typeof value === 'string' && value.length > 80) return value.slice(0, 80) + '…';
  return value;
}

function toNodes(accRoot: Map<string, Acc>, sampleSize: number): FieldSchemaNode[] {
  const paths = [...accRoot.keys()].sort();
  const nodes: FieldSchemaNode[] = [];
  for (const path of paths) {
    // Only top-level entries in the flat list; UI can group by path
    if (path.includes('.')) continue;
    nodes.push(buildNode(path, accRoot, sampleSize));
  }
  nodes.sort((a, b) => b.presence - a.presence || a.path.localeCompare(b.path));
  return nodes;
}

function buildNode(path: string, accRoot: Map<string, Acc>, sampleSize: number): FieldSchemaNode {
  const acc = accRoot.get(path) ?? newAcc();
  const types: FieldTypeStat[] = [...acc.types.entries()]
    .map(([type, v]) => ({ type, count: v.count, samples: v.samples }))
    .sort((a, b) => b.count - a.count);

  const childPaths = [...accRoot.keys()].filter(
    (p) => p.startsWith(path + '.') && !p.slice(path.length + 1).includes('.'),
  );
  const children = childPaths
    .map((p) => buildNode(p, accRoot, sampleSize))
    .sort((a, b) => b.presence - a.presence);

  return {
    path,
    presence: sampleSize > 0 ? acc.count / sampleSize : 0,
    count: acc.count,
    types,
    ...(children.length ? { children } : {}),
  };
}

export function analyzeDocuments(docs: Record<string, unknown>[]): SchemaAnalysisResult {
  const sampleSize = docs.length;
  const accRoot = new Map<string, Acc>();
  for (const doc of docs) {
    walkObject(doc, accRoot, '', 0);
  }
  // Include nested paths as flat list for power users + tree via children of roots
  const fields = toNodes(accRoot, sampleSize);
  // Also attach a flat list of all nested for API consumers
  const allFlat: FieldSchemaNode[] = [...accRoot.entries()]
    .map(([path, acc]) => ({
      path,
      presence: sampleSize > 0 ? acc.count / sampleSize : 0,
      count: acc.count,
      types: [...acc.types.entries()]
        .map(([type, v]) => ({ type, count: v.count, samples: v.samples }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.presence - a.presence || a.path.localeCompare(b.path));

  return { sampleSize, fields: fields.length ? fields : allFlat.slice(0, 200), allFields: allFlat } as SchemaAnalysisResult & {
    allFields?: FieldSchemaNode[];
  };
}
