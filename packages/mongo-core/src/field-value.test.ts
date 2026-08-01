import { Decimal128, Long, ObjectId } from 'bson';
import { describe, expect, it } from 'vitest';
import {
  inferFieldEditType,
  parseFieldEditorValue,
  serializeFieldEditorValue,
} from './field-value.js';
import { fromEJSON, toEJSON } from './ejson.js';

describe('parseFieldEditorValue', () => {
  it('parses string, bool, null', () => {
    expect(parseFieldEditorValue('hello', 'string')).toBe('hello');
    expect(parseFieldEditorValue(true, 'bool')).toBe(true);
    expect(parseFieldEditorValue('false', 'bool')).toBe(false);
    expect(parseFieldEditorValue('x', 'null')).toBeNull();
  });

  it('parses int and double', () => {
    expect(parseFieldEditorValue('42', 'int')).toBe(42);
    expect(parseFieldEditorValue('3.14', 'double')).toBeCloseTo(3.14);
  });

  it('parses long without precision loss', () => {
    const exact = '9007199254740993';
    const v = parseFieldEditorValue(exact, 'long');
    expect(Long.isLong(v)).toBe(true);
    expect((v as Long).toString()).toBe(exact);
    // round-trip through EJSON used by API
    const ejson = toEJSON({ n: v }) as { n: { $numberLong: string } };
    expect(ejson.n.$numberLong).toBe(exact);
    const back = fromEJSON(ejson) as { n: Long };
    expect(back.n.toString()).toBe(exact);
  });

  it('parses decimal', () => {
    const v = parseFieldEditorValue('99.50', 'decimal');
    expect(v).toBeInstanceOf(Decimal128);
    expect((v as Decimal128).toString()).toBe('99.50');
  });

  it('parses date from ISO and datetime-local', () => {
    const iso = parseFieldEditorValue('2020-05-01T00:00:00.000Z', 'date') as Date;
    expect(iso.toISOString()).toBe('2020-05-01T00:00:00.000Z');
    const local = parseFieldEditorValue('2024-06-15T12:30', 'date') as Date;
    expect(local).toBeInstanceOf(Date);
    expect(Number.isNaN(local.getTime())).toBe(false);
  });

  it('parses objectId', () => {
    const hex = '626dd5775947fc3a08b2c6dc';
    const v = parseFieldEditorValue(hex, 'objectId');
    expect(v).toBeInstanceOf(ObjectId);
    expect((v as ObjectId).toHexString()).toBe(hex);
  });

  it('rejects invalid objectId', () => {
    expect(() => parseFieldEditorValue('not-an-id', 'objectId')).toThrow();
  });
});

describe('serializeFieldEditorValue', () => {
  it('serializes long and objectId for inputs', () => {
    expect(serializeFieldEditorValue(Long.fromString('9007199254740993'), 'long')).toBe(
      '9007199254740993',
    );
    const id = new ObjectId('626dd5775947fc3a08b2c6dc');
    expect(serializeFieldEditorValue(id, 'objectId')).toBe('626dd5775947fc3a08b2c6dc');
  });

  it('serializes EJSON wrappers', () => {
    expect(serializeFieldEditorValue({ $numberLong: '99' }, 'long')).toBe('99');
    expect(serializeFieldEditorValue({ $oid: '626dd5775947fc3a08b2c6dc' }, 'objectId')).toBe(
      '626dd5775947fc3a08b2c6dc',
    );
  });
});

describe('inferFieldEditType', () => {
  it('infers from BSON and EJSON', () => {
    expect(inferFieldEditType(null)).toBe('null');
    expect(inferFieldEditType(true)).toBe('bool');
    expect(inferFieldEditType(Long.fromNumber(1))).toBe('long');
    expect(inferFieldEditType({ $date: '2020-01-01T00:00:00.000Z' })).toBe('date');
    expect(inferFieldEditType({ $numberDecimal: '1.5' })).toBe('decimal');
  });
});

describe('parseFieldEditorValue type json (EJSON revival)', () => {
  it('revives ObjectId Long Date inside arrays from EJSON text', () => {
    const hex = '626dd5775947fc3a08b2c6dc';
    const exactLong = '9007199254740993';
    const text = JSON.stringify([
      { $oid: hex },
      { $numberLong: exactLong },
      { $date: '2020-05-01T00:00:00.000Z' },
    ]);
    const v = parseFieldEditorValue(text, 'json') as unknown[];
    expect(Array.isArray(v)).toBe(true);
    expect(v[0]).toBeInstanceOf(ObjectId);
    expect((v[0] as ObjectId).toHexString()).toBe(hex);
    expect(Long.isLong(v[1])).toBe(true);
    expect((v[1] as Long).toString()).toBe(exactLong);
    expect(v[2]).toBeInstanceOf(Date);
    expect((v[2] as Date).toISOString()).toBe('2020-05-01T00:00:00.000Z');

    // Wire form after toEJSON must stay canonical typed wrappers
    const wire = toEJSON({ arr: v }) as {
      arr: [{ $oid: string }, { $numberLong: string }, { $date: unknown }];
    };
    expect(wire.arr[0]).toEqual({ $oid: hex });
    expect(wire.arr[1]).toEqual({ $numberLong: exactLong });
  });

  it('no-op style save of EJSON array does not demote ObjectId to plain object', () => {
    const id = new ObjectId();
    const ejsonText = serializeFieldEditorValue([id], 'json') as string;
    // serialize produces EJSON via toEJSON
    expect(ejsonText).toContain('$oid');
    const back = parseFieldEditorValue(ejsonText, 'json') as unknown[];
    expect(back[0]).toBeInstanceOf(ObjectId);
    expect((back[0] as ObjectId).toHexString()).toBe(id.toHexString());
  });
});
