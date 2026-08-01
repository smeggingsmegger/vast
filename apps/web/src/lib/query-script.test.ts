import { describe, expect, it } from 'vitest';
import {
  collectionRef,
  defaultFindScript,
  findBuilderToScript,
  parseMongoJson,
  parseQueryScript,
  builderToFilter,
  emptyBuilderState,
} from './query-script';

describe('collectionRef', () => {
  it('uses dotted form for simple names', () => {
    expect(collectionRef('imap_accounts')).toBe('db.imap_accounts');
  });
  it('uses getCollection for special names', () => {
    expect(collectionRef('my-col')).toBe('db.getCollection("my-col")');
  });
});

describe('parseMongoJson', () => {
  it('parses plain JSON', () => {
    expect(parseMongoJson('{ "a": 1 }')).toEqual({ a: 1 });
  });
  it('parses ObjectId', () => {
    expect(parseMongoJson('{ _id: ObjectId("507f1f77bcf86cd799439011") }')).toEqual({
      _id: { $oid: '507f1f77bcf86cd799439011' },
    });
  });
});

describe('parseQueryScript', () => {
  it('parses default find chain', () => {
    const script = defaultFindScript('imap_accounts');
    const parsed = parseQueryScript(script);
    expect(parsed.kind).toBe('find');
    if (parsed.kind !== 'find' && parsed.kind !== 'findOne' && parsed.kind !== 'count') {
      throw new Error('expected find');
    }
    expect(parsed.filter).toEqual({});
    expect(parsed.sort).toEqual({ _id: -1 });
    expect(parsed.limit).toBe(50);
    expect(parsed.collection).toBe('imap_accounts');
  });

  it('parses find with filter', () => {
    const parsed = parseQueryScript('db.users.find({ status: "active" }).limit(10)');
    expect(parsed.kind).toBe('find');
    if (parsed.kind !== 'find' && parsed.kind !== 'findOne' && parsed.kind !== 'count') {
      throw new Error('expected find');
    }
    expect(parsed.filter).toEqual({ status: 'active' });
    expect(parsed.limit).toBe(10);
  });

  it('parses aggregate', () => {
    const parsed = parseQueryScript('db.users.aggregate([{ $match: {} }, { $limit: 5 }])');
    expect(parsed.kind).toBe('aggregate');
    if (parsed.kind !== 'aggregate') throw new Error('expected aggregate');
    expect(parsed.pipeline).toHaveLength(2);
  });

  it('parses updateMany', () => {
    const parsed = parseQueryScript('db.users.updateMany({ a: 1 }, { $set: { b: 2 } })');
    expect(parsed.kind).toBe('updateMany');
    if (parsed.kind !== 'updateMany') throw new Error('expected updateMany');
    expect(parsed.filter).toEqual({ a: 1 });
    expect(parsed.update).toEqual({ $set: { b: 2 } });
  });

  it('parses deleteMany', () => {
    const parsed = parseQueryScript('db.users.deleteMany({ status: "archived" })');
    expect(parsed.kind).toBe('deleteMany');
    if (parsed.kind !== 'deleteMany') throw new Error('expected deleteMany');
    expect(parsed.filter).toEqual({ status: 'archived' });
  });
});

describe('findBuilderToScript', () => {
  it('builds empty find', () => {
    const state = emptyBuilderState();
    state.conditions = [];
    const script = findBuilderToScript('items', state);
    expect(script).toContain('db.items.find({})');
    expect(script).toContain('.limit(50)');
  });

  it('builds equality filter', () => {
    const state = emptyBuilderState();
    state.conditions = [{ id: '1', field: 'status', op: 'eq', value: 'active' }];
    expect(builderToFilter(state)).toEqual({ status: 'active' });
    const script = findBuilderToScript('items', state);
    expect(script).toContain('"status":"active"');
  });
});
