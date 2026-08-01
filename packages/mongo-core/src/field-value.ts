import { Decimal128, Long, ObjectId } from 'bson';
import { ErrorCode, VastError } from '@vast/shared';
import { fromEJSON, toEJSON } from './ejson.js';

/** BSON field types supported by the single-field editor. */
export type FieldEditType =
  | 'string'
  | 'int'
  | 'long'
  | 'double'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'objectId'
  | 'null'
  | 'json';

/**
 * Parse a user-facing editor value into a BSON-native value for $set.
 * Input is typically a string from the UI (or boolean/number for specialized controls).
 */
export function parseFieldEditorValue(raw: unknown, type: FieldEditType): unknown {
  if (type === 'null') return null;

  if (type === 'bool') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const s = raw.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'no') return false;
    }
    throw bad(type, raw);
  }

  if (type === 'string') {
    if (raw === null || raw === undefined) return '';
    return String(raw);
  }

  if (type === 'int') {
    const n = coerceNumber(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw bad(type, raw);
    return Math.trunc(n);
  }

  if (type === 'double') {
    const n = coerceNumber(raw);
    if (!Number.isFinite(n)) throw bad(type, raw);
    return n;
  }

  if (type === 'long') {
    if (Long.isLong(raw)) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return Long.fromNumber(Math.trunc(raw));
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        return Long.fromString(raw.trim());
      } catch {
        throw bad(type, raw);
      }
    }
    throw bad(type, raw);
  }

  if (type === 'decimal') {
    if (raw instanceof Decimal128) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return Decimal128.fromString(String(raw));
    if (typeof raw === 'string' && raw.trim() !== '') {
      try {
        return Decimal128.fromString(raw.trim());
      } catch {
        throw bad(type, raw);
      }
    }
    throw bad(type, raw);
  }

  if (type === 'date') {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      // datetime-local often comes as "YYYY-MM-DDTHH:mm" without Z
      const d = new Date(raw.trim());
      if (!Number.isNaN(d.getTime())) return d;
    }
    throw bad(type, raw);
  }

  if (type === 'objectId') {
    if (raw instanceof ObjectId) return raw;
    if (typeof raw === 'string') {
      try {
        return ObjectId.createFromHexString(raw.trim());
      } catch {
        throw bad(type, raw);
      }
    }
    throw bad(type, raw);
  }

  if (type === 'json') {
    // UI sends Extended JSON text (or object). Must revive $oid/$date/$numberLong into BSON,
    // not leave plain subdocs — otherwise arrays/objects silently corrupt typed leaves.
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new VastError(ErrorCode.VALIDATION, 'Invalid JSON value', { status: 422 });
      }
    }
    try {
      return fromEJSON(parsed);
    } catch (err) {
      throw new VastError(ErrorCode.VALIDATION, 'Invalid Extended JSON value', {
        status: 422,
        cause: err,
      });
    }
  }

  throw bad(type, raw);
}

/**
 * Serialize a BSON-native or EJSON value into a form suitable for type-aware UI controls.
 */
export function serializeFieldEditorValue(
  value: unknown,
  type: FieldEditType,
): string | boolean | null {
  if (type === 'null' || value === null) return null;
  if (type === 'bool') return Boolean(value);

  if (type === 'objectId') {
    if (value instanceof ObjectId) return value.toHexString();
    if (value && typeof value === 'object' && '$oid' in value) {
      return String((value as { $oid: string }).$oid);
    }
    return String(value ?? '');
  }

  if (type === 'date') {
    const d = coerceDate(value);
    if (!d) return '';
    // datetime-local expects local wall time "YYYY-MM-DDTHH:mm"
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  if (type === 'long') {
    if (Long.isLong(value)) return value.toString();
    if (value && typeof value === 'object' && '$numberLong' in value) {
      return String((value as { $numberLong: string }).$numberLong);
    }
    return String(value ?? '');
  }

  if (type === 'decimal') {
    if (value instanceof Decimal128) return value.toString();
    if (value && typeof value === 'object' && '$numberDecimal' in value) {
      return String((value as { $numberDecimal: string }).$numberDecimal);
    }
    return String(value ?? '');
  }

  if (type === 'int' || type === 'double') {
    if (value && typeof value === 'object') {
      if ('$numberInt' in value) return String((value as { $numberInt: string }).$numberInt);
      if ('$numberDouble' in value) return String((value as { $numberDouble: string }).$numberDouble);
      if ('$numberLong' in value) return String((value as { $numberLong: string }).$numberLong);
    }
    return String(value ?? '');
  }

  if (type === 'json') {
    return JSON.stringify(toEJSON(value), null, 2);
  }

  return String(value ?? '');
}

/** Infer a reasonable FieldEditType from a BSON/EJSON value. */
export function inferFieldEditType(value: unknown): FieldEditType {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  }
  if (value instanceof Date) return 'date';
  if (value instanceof ObjectId) return 'objectId';
  if (Long.isLong(value)) return 'long';
  if (value instanceof Decimal128) return 'decimal';
  if (value && typeof value === 'object') {
    if ('$oid' in value) return 'objectId';
    if ('$date' in value) return 'date';
    if ('$numberLong' in value) return 'long';
    if ('$numberDecimal' in value) return 'decimal';
    if ('$numberInt' in value) return 'int';
    if ('$numberDouble' in value) return 'double';
    return 'json';
  }
  return 'string';
}

function coerceNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return Number(raw.trim());
  if (Long.isLong(raw)) return raw.toNumber();
  return Number.NaN;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof value === 'object' && '$date' in value) {
    const inner = (value as { $date: unknown }).$date;
    if (typeof inner === 'string') {
      const d = new Date(inner);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof inner === 'number') {
      const d = new Date(inner);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (inner && typeof inner === 'object' && '$numberLong' in inner) {
      const d = new Date(Number((inner as { $numberLong: string }).$numberLong));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function bad(type: string, raw: unknown): VastError {
  return new VastError(ErrorCode.VALIDATION, `Cannot parse value as ${type}`, {
    status: 422,
    details: { rawType: raw === null ? 'null' : typeof raw },
  });
}
