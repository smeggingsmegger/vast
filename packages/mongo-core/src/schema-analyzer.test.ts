import { ObjectId } from 'bson';
import { describe, expect, it } from 'vitest';
import { analyzeDocuments } from './schema-analyzer.js';

describe('analyzeDocuments', () => {
  it('reports field presence and types', () => {
    const docs = [
      { _id: new ObjectId(), name: 'a', age: 1 },
      { _id: new ObjectId(), name: 'b', tags: ['x'] },
      { _id: new ObjectId(), name: 'c', age: 2, nested: { z: true } },
    ];
    const result = analyzeDocuments(docs);
    expect(result.sampleSize).toBe(3);
    const name = result.fields.find((f) => f.path === 'name');
    expect(name?.presence).toBe(1);
    expect(name?.types.some((t) => t.type === 'string')).toBe(true);
    const age = result.fields.find((f) => f.path === 'age');
    expect(age?.presence).toBeCloseTo(2 / 3, 5);
  });
});
