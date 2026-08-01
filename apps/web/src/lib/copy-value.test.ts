import { describe, expect, it } from 'vitest';
import { valueAsMongoShell, valueAsString } from './copy-value';

describe('valueAsString', () => {
  it('returns ObjectId hex', () => {
    expect(valueAsString({ $oid: '626dd5775947fc3a08b2c6dc' })).toBe('626dd5775947fc3a08b2c6dc');
  });

  it('returns long digits', () => {
    expect(valueAsString({ $numberLong: '9007199254740993' })).toBe('9007199254740993');
  });
});

describe('valueAsMongoShell', () => {
  it('formats ObjectId', () => {
    expect(valueAsMongoShell({ $oid: '626dd5775947fc3a08b2c6dc' })).toBe(
      'ObjectId("626dd5775947fc3a08b2c6dc")',
    );
  });

  it('formats ISODate from canonical $date', () => {
    expect(valueAsMongoShell({ $date: { $numberLong: '1588291200000' } })).toBe(
      'ISODate("2020-05-01T00:00:00.000Z")',
    );
  });

  it('formats NumberLong and NumberDecimal', () => {
    expect(valueAsMongoShell({ $numberLong: '9007199254740993' })).toBe(
      'NumberLong("9007199254740993")',
    );
    expect(valueAsMongoShell({ $numberDecimal: '19.99' })).toBe('NumberDecimal("19.99")');
  });

  it('formats arrays with mixed types', () => {
    const s = valueAsMongoShell([{ $oid: '626dd5775947fc3a08b2c6dc' }, 'x']);
    expect(s).toBe('[ObjectId("626dd5775947fc3a08b2c6dc"), "x"]');
  });

  it('formats plain strings and null', () => {
    expect(valueAsMongoShell('hello')).toBe('"hello"');
    expect(valueAsMongoShell(null)).toBe('null');
  });
});
