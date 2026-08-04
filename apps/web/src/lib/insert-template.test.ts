import { describe, expect, it } from 'vitest';
import {
  documentFromFields,
  fieldsFromSample,
  jsonTemplateFromSample,
  kindOfValue,
} from './insert-template';

describe('insert-template', () => {
  it('infers kinds from sample values', () => {
    expect(kindOfValue('a')).toBe('string');
    expect(kindOfValue(1)).toBe('number');
    expect(kindOfValue(true)).toBe('boolean');
    expect(kindOfValue(null)).toBe('null');
    expect(kindOfValue({ $oid: '507f1f77bcf86cd799439011' })).toBe('objectId');
    expect(kindOfValue({ $date: '2020-01-01T00:00:00.000Z' })).toBe('date');
    expect(kindOfValue({ nested: 1 })).toBe('json');
  });

  it('builds fields without _id, sorted', () => {
    const fields = fieldsFromSample({
      _id: { $oid: '507f1f77bcf86cd799439011' },
      name: 'Ada',
      age: 36,
      active: true,
    });
    expect(fields.map((f) => f.key)).toEqual(['active', 'age', 'name']);
    expect(fields.find((f) => f.key === 'active')?.kind).toBe('boolean');
  });

  it('documentFromFields builds insertable object', () => {
    const fields = fieldsFromSample({ name: 'x', n: 1, ok: false });
    const filled = fields.map((f) => {
      if (f.key === 'name') return { ...f, value: 'Bob' };
      if (f.key === 'n') return { ...f, value: '9' };
      if (f.key === 'ok') return { ...f, boolValue: true };
      return f;
    });
    expect(documentFromFields(filled)).toEqual({ name: 'Bob', n: 9, ok: true });
  });

  it('jsonTemplateFromSample omits _id', () => {
    const t = jsonTemplateFromSample({ _id: { $oid: 'a'.repeat(24) }, a: 1 });
    expect(t).not.toContain('_id');
    expect(JSON.parse(t)).toHaveProperty('a');
  });
});
