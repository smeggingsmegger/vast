import { Binary, Decimal128, Long, ObjectId, Timestamp } from 'bson';
import { describe, expect, it } from 'vitest';
import { fromEJSON, parseEJSON, stringifyEJSON, toEJSON } from './ejson.js';

describe('EJSON codec', () => {
  it('round-trips ObjectId', () => {
    const id = new ObjectId();
    const ejson = toEJSON({ _id: id });
    const back = fromEJSON(ejson) as { _id: ObjectId };
    expect(back._id.toHexString()).toBe(id.toHexString());
  });

  it('round-trips Date', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    const ejson = toEJSON({ createdAt: date });
    const back = fromEJSON(ejson) as { createdAt: Date };
    expect(back.createdAt.toISOString()).toBe(date.toISOString());
  });

  it('default codec preserves Long beyond MAX_SAFE_INTEGER (no silent corruption)', () => {
    const exact = '9007199254740993';
    const doc = {
      big: Long.fromString(exact),
      money: Decimal128.fromString('99.50'),
    };
    // Defaults must be canonical — relaxed would turn big into 9007199254740992
    const ejson = toEJSON(doc) as {
      big: { $numberLong: string };
      money: { $numberDecimal: string };
    };
    expect(ejson.big).toEqual({ $numberLong: exact });
    expect(ejson.money).toEqual({ $numberDecimal: '99.50' });

    const back = fromEJSON(ejson) as { big: Long; money: Decimal128 };
    expect(Long.isLong(back.big)).toBe(true);
    expect(back.big.toString()).toBe(exact);
    expect(back.money.toString()).toBe('99.50');

    // Full serialize → parse text path used by import/export
    const text = stringifyEJSON(doc);
    expect(text).toContain(exact);
    const parsed = parseEJSON(text) as { big: Long; money: Decimal128 };
    expect(Long.isLong(parsed.big)).toBe(true);
    expect(parsed.big.toString()).toBe(exact);
  });

  it('relaxed wire form loses exact Long digits (why defaults are canonical)', () => {
    const exact = '9007199254740993';
    const doc = { big: Long.fromString(exact) };
    const relaxed = toEJSON(doc, true) as { big: number | { $numberLong: string } };
    const canonical = toEJSON(doc) as { big: { $numberLong: string } };
    // Canonical always keeps exact string digits
    expect(canonical.big.$numberLong).toBe(exact);
    // Relaxed may emit a JS number — Number(exact) is already rounded in IEEE754
    if (typeof relaxed.big === 'number') {
      expect(String(relaxed.big)).not.toBe(exact);
    } else if (relaxed.big && typeof relaxed.big === 'object' && '$numberLong' in relaxed.big) {
      // If driver still uses $numberLong under relaxed for out-of-range, value must match
      expect(relaxed.big.$numberLong).toBe(exact);
    }
  });

  it('round-trips Binary', () => {
    const bin = new Binary(Buffer.from('hello'));
    const back = fromEJSON(toEJSON({ bin })) as { bin: Binary };
    expect(Buffer.from(back.bin.buffer).toString()).toBe('hello');
  });

  it('round-trips Timestamp', () => {
    const ts = new Timestamp({ t: 1000, i: 1 });
    const back = fromEJSON(toEJSON({ ts })) as { ts: Timestamp };
    expect(back.ts.getHighBits()).toBe(ts.getHighBits());
    expect(back.ts.getLowBits()).toBe(ts.getLowBits());
  });

  it('round-trips nested arrays and null (canonical may use Int32 for numbers)', () => {
    const doc = { tags: ['a', 'b'], nested: { x: 1, y: null }, flag: true };
    const wire = toEJSON(doc) as {
      tags: string[];
      nested: { x: { $numberInt: string } | number; y: null };
      flag: boolean;
    };
    const back = fromEJSON(wire) as {
      tags: string[];
      nested: { x: { value?: number } | number; y: null };
      flag: boolean;
    };
    expect(back.tags).toEqual(['a', 'b']);
    expect(back.flag).toBe(true);
    expect(back.nested.y).toBeNull();
    const x = back.nested.x;
    const n = typeof x === 'number' ? x : Number((x as { value?: number }).value ?? x);
    expect(n).toBe(1);
  });
});
