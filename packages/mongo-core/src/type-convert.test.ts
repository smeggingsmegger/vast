import { Decimal128, Long, ObjectId } from 'bson';
import { describe, expect, it } from 'vitest';
import { convertFieldValue, getByPath, setByPath } from './type-convert.js';

describe('convertFieldValue', () => {
  it('converts string to objectId', () => {
    const id = new ObjectId();
    const out = convertFieldValue(id.toHexString(), 'objectId');
    expect(out).toBeInstanceOf(ObjectId);
    expect((out as ObjectId).toHexString()).toBe(id.toHexString());
  });

  it('converts string to date', () => {
    const out = convertFieldValue('2024-01-15T00:00:00.000Z', 'date');
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  it('converts number string to long', () => {
    const out = convertFieldValue('9007199254740993', 'long');
    expect(Long.isLong(out)).toBe(true);
    expect((out as Long).toString()).toBe('9007199254740993');
  });

  it('converts to decimal', () => {
    const out = convertFieldValue('19.99', 'decimal');
    expect(out).toBeInstanceOf(Decimal128);
    expect((out as Decimal128).toString()).toBe('19.99');
  });

  it('converts to null', () => {
    expect(convertFieldValue('x', 'null')).toBeNull();
  });
});

describe('path helpers', () => {
  it('gets and sets nested paths', () => {
    const doc = { a: { b: 1 }, c: 2 };
    expect(getByPath(doc, 'a.b')).toBe(1);
    const next = setByPath(doc, 'a.b', 3);
    expect(getByPath(next, 'a.b')).toBe(3);
    expect(doc.a.b).toBe(1);
  });
});
