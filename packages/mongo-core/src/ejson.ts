import { EJSON } from 'bson';

/**
 * Convert a BSON document (or value) to Extended JSON.
 *
 * Default is **canonical** (`relaxed: false`) so Int32/Long/Double/Decimal128
 * never silently collapse to JS Number (which corrupts values outside
 * Number.MAX_SAFE_INTEGER, e.g. Long 9007199254740993).
 */
export function toEJSON(value: unknown, relaxed = false): unknown {
  return EJSON.serialize(value as object, { relaxed });
}

/**
 * Parse Extended JSON into BSON-compatible values.
 * Default canonical so `$numberLong` / `$numberDecimal` stay typed.
 */
export function fromEJSON(value: unknown, relaxed = false): unknown {
  return EJSON.deserialize(value as object, { relaxed });
}

/**
 * Stringify a value as Extended JSON text (canonical by default).
 */
export function stringifyEJSON(value: unknown, relaxed = false, pretty = false): string {
  return EJSON.stringify(value, undefined, pretty ? 2 : undefined, { relaxed });
}

/**
 * Parse Extended JSON text into a value (canonical by default).
 */
export function parseEJSON(text: string, relaxed = false): unknown {
  return EJSON.parse(text, { relaxed });
}
