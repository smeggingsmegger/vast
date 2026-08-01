import { describe, expect, it } from 'vitest';
import { bsonTypeOf, formatCell, formatEjsonDate } from './api';

describe('formatEjsonDate', () => {
  it('formats ISO string', () => {
    expect(formatEjsonDate('2020-05-01T00:00:00.000Z')).toBe('2020-05-01T00:00:00.000Z');
  });

  it('formats canonical $numberLong epoch ms without throwing', () => {
    // This form is what canonical EJSON returns for Date — previously crashed the UI
    const s = formatEjsonDate({ $numberLong: '1588291200000' });
    expect(s).toBe('2020-05-01T00:00:00.000Z');
  });

  it('formats numeric epoch', () => {
    expect(formatEjsonDate(1588291200000)).toBe('2020-05-01T00:00:00.000Z');
  });
});

describe('formatCell', () => {
  it('never throws on canonical date wrapper', () => {
    const v = { $date: { $numberLong: '1588291200000' } };
    expect(() => formatCell(v)).not.toThrow();
    expect(formatCell(v)).toBe('2020-05-01T00:00:00.000Z');
  });

  it('formats ObjectId and Long', () => {
    expect(formatCell({ $oid: '626dd5775947fc3a08b2c6dc' })).toBe('626dd5775947fc3a08b2c6dc');
    expect(formatCell({ $numberLong: '9007199254740993' })).toBe('9007199254740993');
    expect(formatCell({ $numberInt: '37' })).toBe('37');
  });

  it('formats nested objects via JSON', () => {
    expect(formatCell({ a: 1 })).toContain('a');
  });
});

describe('bsonTypeOf', () => {
  it('detects date and long', () => {
    expect(bsonTypeOf({ $date: { $numberLong: '1' } })).toBe('date');
    expect(bsonTypeOf({ $numberLong: '1' })).toBe('long');
  });
});
