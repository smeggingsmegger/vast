/**
 * Build insert templates from a sample document (most recent / any row).
 * Strips _id and produces empty-ish defaults matching the sample shape.
 */

export type FormFieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'date'
  | 'objectId'
  | 'json';

export interface FormField {
  key: string;
  kind: FormFieldKind;
  /** Default / current string value for the editor */
  value: string;
  /** For boolean */
  boolValue?: boolean;
}

function isEjsonObjectId(v: unknown): v is { $oid: string } {
  return !!v && typeof v === 'object' && '$oid' in (v as object);
}
function isEjsonDate(v: unknown): v is { $date: unknown } {
  return !!v && typeof v === 'object' && '$date' in (v as object);
}
function isEjsonNumber(v: unknown): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    ('$numberInt' in (v as object) ||
      '$numberLong' in (v as object) ||
      '$numberDouble' in (v as object) ||
      '$numberDecimal' in (v as object))
  );
}

export function kindOfValue(v: unknown): FormFieldKind {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (isEjsonObjectId(v)) return 'objectId';
  if (isEjsonDate(v)) return 'date';
  if (isEjsonNumber(v)) return 'number';
  return 'json';
}

/** Empty default for a kind (for form blanks based on sample). */
export function emptyValueForKind(kind: FormFieldKind, sample?: unknown): string | boolean {
  switch (kind) {
    case 'string':
      return '';
    case 'number':
      return '';
    case 'boolean':
      return false;
    case 'null':
      return '';
    case 'date':
      return new Date().toISOString();
    case 'objectId':
      return '';
    case 'json':
      if (Array.isArray(sample)) return '[]';
      return '{}';
  }
}

/**
 * Top-level fields only (nested objects/arrays as JSON blobs).
 * Omits `_id`.
 */
export function fieldsFromSample(sample: Record<string, unknown> | null | undefined): FormField[] {
  if (!sample || typeof sample !== 'object') return [];
  const keys = Object.keys(sample)
    .filter((k) => k !== '_id')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return keys.map((key) => {
    const sampleVal = sample[key];
    const kind = kindOfValue(sampleVal);
    if (kind === 'boolean') {
      return { key, kind, value: '', boolValue: false };
    }
    if (kind === 'json') {
      // Keep a slim empty structure of the same type (array vs object)
      return {
        key,
        kind,
        value: Array.isArray(sampleVal) ? '[]' : '{}',
      };
    }
    if (kind === 'date') {
      return { key, kind, value: new Date().toISOString() };
    }
    return {
      key,
      kind,
      value: String(emptyValueForKind(kind)),
    };
  });
}

/** Build a document object from form fields (for insert). */
export function documentFromFields(fields: FormField[]): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'boolean') {
      doc[f.key] = !!f.boolValue;
      continue;
    }
    if (f.kind === 'null') {
      doc[f.key] = null;
      continue;
    }
    const raw = f.value.trim();
    if (f.kind === 'string') {
      doc[f.key] = f.value;
      continue;
    }
    if (f.kind === 'number') {
      if (raw === '') continue;
      // Prefer int when whole number
      if (/^-?\d+$/.test(raw)) {
        const n = Number(raw);
        if (Number.isSafeInteger(n)) doc[f.key] = n;
        else doc[f.key] = { $numberLong: raw };
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`Invalid number for “${f.key}”`);
        doc[f.key] = n;
      }
      continue;
    }
    if (f.kind === 'date') {
      if (!raw) continue;
      // Accept ISO string → EJSON date
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for “${f.key}”`);
      doc[f.key] = { $date: d.toISOString() };
      continue;
    }
    if (f.kind === 'objectId') {
      if (!raw) continue;
      if (!/^[a-fA-F0-9]{24}$/.test(raw)) {
        throw new Error(`Invalid ObjectId for “${f.key}” (need 24 hex chars)`);
      }
      doc[f.key] = { $oid: raw };
      continue;
    }
    if (f.kind === 'json') {
      if (!raw) continue;
      try {
        doc[f.key] = JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSON for “${f.key}”`);
      }
    }
  }
  return doc;
}

/** Pretty JSON template from sample without _id (empty-ish values). */
export function jsonTemplateFromSample(
  sample: Record<string, unknown> | null | undefined,
): string {
  const fields = fieldsFromSample(sample);
  if (fields.length === 0) return '{\n  \n}';
  try {
    // Seed blanks so keys still appear (empty number strings are skipped on insert)
    const seeded = fields.map((f) => {
      if (f.kind === 'boolean') return { ...f, boolValue: false };
      if (f.kind === 'number') return { ...f, value: '0' };
      if (f.kind === 'string') return { ...f, value: '' };
      if (f.kind === 'date') return { ...f, value: new Date().toISOString() };
      if (f.kind === 'json') return { ...f, value: f.value || '{}' };
      if (f.kind === 'null') return f;
      if (f.kind === 'objectId') return { ...f, value: '000000000000000000000000' };
      return f;
    });
    const doc = documentFromFields(seeded);
    return JSON.stringify(doc, null, 2);
  } catch {
    return '{\n  \n}';
  }
}

export function prettyJsonFromDoc(doc: Record<string, unknown>): string {
  const clone = { ...doc };
  delete clone._id;
  return JSON.stringify(clone, null, 2);
}
