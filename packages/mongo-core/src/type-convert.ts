import { Decimal128, Long, ObjectId } from 'bson';
import { ErrorCode, VastError } from '@vast/shared';

export type ConvertibleType =
  | 'string'
  | 'int'
  | 'long'
  | 'double'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'objectId'
  | 'null';

export function convertFieldValue(value: unknown, to: ConvertibleType): unknown {
  if (to === 'null') return null;

  switch (to) {
    case 'string':
      return valueToString(value);
    case 'int':
    case 'double':
      return valueToNumber(value, to);
    case 'long':
      return valueToLong(value);
    case 'decimal':
      return valueToDecimal(value);
    case 'bool':
      return valueToBool(value);
    case 'date':
      return valueToDate(value);
    case 'objectId':
      return valueToObjectId(value);
    default:
      throw new VastError(ErrorCode.VALIDATION, `Unsupported target type: ${to}`);
  }
}

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Long.isLong(value)) return value.toString();
  if (value instanceof Decimal128) return value.toString();
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function valueToNumber(value: unknown, kind: 'int' | 'double'): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return kind === 'int' ? Math.trunc(value) : value;
  }
  if (Long.isLong(value)) {
    const n = value.toNumber();
    return kind === 'int' ? Math.trunc(n) : n;
  }
  if (value instanceof Decimal128) {
    const n = Number(value.toString());
    if (!Number.isFinite(n)) throw bad('number', value);
    return kind === 'int' ? Math.trunc(n) : n;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw bad('number', value);
    return kind === 'int' ? Math.trunc(n) : n;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw bad('number', value);
}

function valueToLong(value: unknown): Long {
  if (Long.isLong(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Long.fromNumber(Math.trunc(value));
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      return Long.fromString(value.trim());
    } catch {
      throw bad('long', value);
    }
  }
  if (value instanceof Decimal128) {
    try {
      return Long.fromString(value.toString().split('.')[0] ?? '0');
    } catch {
      throw bad('long', value);
    }
  }
  throw bad('long', value);
}

function valueToDecimal(value: unknown): Decimal128 {
  if (value instanceof Decimal128) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return Decimal128.fromString(String(value));
  if (Long.isLong(value)) return Decimal128.fromString(value.toString());
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      return Decimal128.fromString(value.trim());
    } catch {
      throw bad('decimal', value);
    }
  }
  throw bad('decimal', value);
}

function valueToBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (Long.isLong(value)) return !value.equals(Long.ZERO);
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === '') return false;
  }
  throw bad('bool', value);
}

function valueToDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw bad('date', value);
}

function valueToObjectId(value: unknown): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string') {
    try {
      return ObjectId.createFromHexString(value);
    } catch {
      throw bad('objectId', value);
    }
  }
  throw bad('objectId', value);
}

function bad(to: string, value: unknown): VastError {
  return new VastError(ErrorCode.VALIDATION, `Cannot convert value to ${to}`, {
    status: 422,
    details: { valueType: value === null ? 'null' : typeof value },
  });
}

/** Get nested value by dotted path (no array indexes). */
export function getByPath(doc: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = doc;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Set nested value by dotted path, mutating a shallow-cloned structure. */
export function setByPath(doc: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const root = { ...doc };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    const clone =
      next !== null && typeof next === 'object' && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cur[p] = clone;
    cur = clone;
  }
  cur[parts[parts.length - 1]!] = value;
  return root;
}
