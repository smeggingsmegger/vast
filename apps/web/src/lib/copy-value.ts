/**
 * Copy helpers for document field values (EJSON from the API).
 * - string: plain representation (ObjectId hex, ISO date, etc.)
 * - mongo: mongosh-style (ObjectId("..."), ISODate("..."), NumberLong("..."), …)
 */

import { formatCell, formatEjsonDate } from './api';

/** Escape a string for inclusion in a double-quoted JS/mongosh literal. */
function quoteJs(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Plain string representation (what users usually paste into forms/search).
 * ObjectId → hex, Date → ISO, Long/Decimal → digits, objects → JSON.
 */
export function valueAsString(value: unknown): string {
  return formatCell(value);
}

/**
 * mongosh / Compass-style literal for the value.
 */
export function valueAsMongoShell(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'string') return quoteJs(value);

  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;

    if ('$oid' in o) {
      return `ObjectId(${quoteJs(String(o.$oid))})`;
    }
    if ('$date' in o) {
      const iso = formatEjsonDate(o.$date);
      return `ISODate(${quoteJs(iso)})`;
    }
    if ('$numberLong' in o) {
      return `NumberLong(${quoteJs(String(o.$numberLong))})`;
    }
    if ('$numberInt' in o) {
      return `NumberInt(${quoteJs(String(o.$numberInt))})`;
    }
    if ('$numberDouble' in o) {
      return `NumberDouble(${quoteJs(String(o.$numberDouble))})`;
    }
    if ('$numberDecimal' in o) {
      return `NumberDecimal(${quoteJs(String(o.$numberDecimal))})`;
    }
    if ('$binary' in o) {
      const bin = o.$binary as { base64?: string; subType?: string } | string;
      if (typeof bin === 'string') return `BinData(0, ${quoteJs(bin)})`;
      return `BinData(${bin.subType ?? 0}, ${quoteJs(bin.base64 ?? '')})`;
    }
    if ('$regularExpression' in o) {
      const re = o.$regularExpression as { pattern?: string; options?: string };
      return `/${re.pattern ?? ''}/${re.options ?? ''}`;
    }
    if ('$timestamp' in o) {
      const ts = o.$timestamp as { t?: number; i?: number };
      return `Timestamp(${ts.t ?? 0}, ${ts.i ?? 0})`;
    }
    if ('$minKey' in o) return 'MinKey()';
    if ('$maxKey' in o) return 'MaxKey()';

    if (Array.isArray(value)) {
      return `[${value.map((v) => valueAsMongoShell(v)).join(', ')}]`;
    }

    // Nested plain object
    const parts = Object.entries(o).map(
      ([k, v]) => `${/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : quoteJs(k)}: ${valueAsMongoShell(v)}`,
    );
    return `{ ${parts.join(', ')} }`;
  }

  return String(value);
}

export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
