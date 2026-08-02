/**
 * Fixture data for Mongo document scenario suite.
 * All shapes are EJSON-friendly as the HTTP API accepts/returns.
 */

export type EjsonDoc = Record<string, unknown>;

/** Mixed BSON seed documents (identity preserved via `fixtureKey`). */
export const SEED_DOCS: EjsonDoc[] = [
  {
    fixtureKey: 'string-basic',
    kind: 'person',
    name: 'Ada Lovelace',
    city: 'London',
    active: true,
  },
  {
    fixtureKey: 'int-age',
    kind: 'person',
    name: 'Grace Hopper',
    age: { $numberInt: '85' },
    active: false,
  },
  {
    fixtureKey: 'long-big',
    kind: 'finance',
    label: 'ledger',
    amount: { $numberLong: '9007199254740993' },
  },
  {
    fixtureKey: 'decimal-money',
    kind: 'finance',
    label: 'balance',
    amount: { $numberDecimal: '12345.67' },
  },
  {
    fixtureKey: 'double-ratio',
    kind: 'metric',
    ratio: { $numberDouble: '0.333333333333' },
  },
  {
    fixtureKey: 'date-iso',
    kind: 'event',
    title: 'launch',
    at: { $date: '2024-06-15T12:30:00.000Z' },
  },
  {
    fixtureKey: 'bool-true',
    kind: 'flag',
    enabled: true,
  },
  {
    fixtureKey: 'bool-false',
    kind: 'flag',
    enabled: false,
  },
  {
    fixtureKey: 'null-field',
    kind: 'sparse',
    value: null,
    note: 'has-null',
  },
  {
    fixtureKey: 'objectid-ref',
    kind: 'ref',
    target: { $oid: '507f1f77bcf86cd799439011' },
  },
  {
    fixtureKey: 'nested-object',
    kind: 'profile',
    user: {
      id: { $numberInt: '1' },
      profile: { bio: 'engineer', level: { $numberInt: '3' } },
    },
  },
  {
    fixtureKey: 'array-strings',
    kind: 'tags',
    tags: ['alpha', 'beta', 'gamma'],
  },
  {
    fixtureKey: 'array-mixed',
    kind: 'mixed-arr',
    items: [
      { $numberInt: '1' },
      'two',
      true,
      null,
      { $date: '2021-01-01T00:00:00.000Z' },
    ],
  },
  {
    fixtureKey: 'array-of-objects',
    kind: 'orders',
    lines: [
      { sku: 'A', qty: { $numberInt: '2' } },
      { sku: 'B', qty: { $numberInt: '5' } },
    ],
  },
  {
    fixtureKey: 'deep-nest',
    kind: 'tree',
    a: { b: { c: { d: 'leaf', n: { $numberInt: '42' } } } },
  },
  {
    fixtureKey: 'empty-object',
    kind: 'empty',
    payload: {},
  },
  {
    fixtureKey: 'empty-array',
    kind: 'empty',
    items: [],
  },
  {
    fixtureKey: 'unicode',
    kind: 'i18n',
    text: '日本語 café 🚀',
  },
  {
    fixtureKey: 'status-pending',
    kind: 'workflow',
    status: 'pending',
    score: { $numberInt: '10' },
  },
  {
    fixtureKey: 'status-done',
    kind: 'workflow',
    status: 'done',
    score: { $numberInt: '20' },
  },
  {
    fixtureKey: 'status-archived',
    kind: 'workflow',
    status: 'archived',
    score: { $numberInt: '0' },
  },
  {
    fixtureKey: 'multi-type',
    kind: 'kitchen-sink',
    s: 'x',
    i: { $numberInt: '7' },
    l: { $numberLong: '100000000000' },
    d: { $numberDecimal: '9.99' },
    f: { $numberDouble: '1.5' },
    b: true,
    n: null,
    dt: { $date: '2019-12-31T23:59:59.000Z' },
    oid: { $oid: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    arr: [1, 2, 3],
    obj: { k: 'v' },
  },
];

/** Set-field matrix: path + type + raw editor value + expected EJSON shape helpers. */
export type SetFieldCase = {
  id: string;
  type: string;
  path: string;
  value: unknown;
  /** Optional seed overrides when creating the host doc */
  seed?: EjsonDoc;
};

export const SET_FIELD_CASES: SetFieldCase[] = [
  { id: 'sf-string', type: 'string', path: 'label', value: 'hello' },
  { id: 'sf-string-empty', type: 'string', path: 'label', value: '' },
  { id: 'sf-string-unicode', type: 'string', path: 'label', value: 'π≈3.14' },
  { id: 'sf-int', type: 'int', path: 'n', value: '42' },
  { id: 'sf-int-neg', type: 'int', path: 'n', value: '-7' },
  { id: 'sf-int-zero', type: 'int', path: 'n', value: '0' },
  { id: 'sf-long', type: 'long', path: 'big', value: '9007199254740993' },
  { id: 'sf-long-small', type: 'long', path: 'big', value: '100' },
  { id: 'sf-double', type: 'double', path: 'ratio', value: '3.14159' },
  { id: 'sf-double-sci', type: 'double', path: 'ratio', value: '1e-6' },
  { id: 'sf-decimal', type: 'decimal', path: 'money', value: '19.99' },
  { id: 'sf-decimal-long', type: 'decimal', path: 'money', value: '0.0000001' },
  { id: 'sf-bool-true', type: 'bool', path: 'flag', value: 'true' },
  { id: 'sf-bool-false', type: 'bool', path: 'flag', value: 'false' },
  { id: 'sf-bool-1', type: 'bool', path: 'flag', value: '1' },
  { id: 'sf-date-iso', type: 'date', path: 'when', value: '2023-03-03T03:03:03.000Z' },
  {
    id: 'sf-objectid',
    type: 'objectId',
    path: 'ref',
    value: '507f191e810c19729de860ea',
  },
  { id: 'sf-null', type: 'null', path: 'gone', value: null },
  {
    id: 'sf-json-obj',
    type: 'json',
    path: 'blob',
    value: '{"a":1,"b":"x"}',
  },
  {
    id: 'sf-json-arr',
    type: 'json',
    path: 'blob',
    value: '[1,2,3]',
  },
  // nested paths
  {
    id: 'sf-nested-string',
    type: 'string',
    path: 'user.name',
    value: 'nested-name',
    seed: { user: { name: 'old' } },
  },
  {
    id: 'sf-nested-int',
    type: 'int',
    path: 'user.age',
    value: '99',
    seed: { user: { age: 1 } },
  },
  {
    id: 'sf-deep-bool',
    type: 'bool',
    path: 'a.b.c',
    value: 'true',
    seed: { a: { b: { c: false } } },
  },
  {
    id: 'sf-array-elem-string',
    type: 'string',
    path: 'tags.0',
    value: 'first',
    seed: { tags: ['old', 'keep'] },
  },
  {
    id: 'sf-array-elem-int',
    type: 'int',
    path: 'nums.1',
    value: '77',
    seed: { nums: [1, 2, 3] },
  },
];

/** Find filter cases applied against seeded collection. */
export type FindCase = {
  id: string;
  filter: unknown;
  /** fixtureKeys expected (subset match after seed of all SEED_DOCS) */
  expectKeys?: string[];
  /** If set, expect exact returned count (for this filter only) */
  expectCount?: number;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  projection?: Record<string, 0 | 1>;
};

export const FIND_CASES: FindCase[] = [
  { id: 'find-all', filter: {}, expectCount: SEED_DOCS.length },
  { id: 'find-kind-person', filter: { kind: 'person' }, expectKeys: ['string-basic', 'int-age'] },
  { id: 'find-kind-finance', filter: { kind: 'finance' }, expectKeys: ['long-big', 'decimal-money'] },
  { id: 'find-kind-workflow', filter: { kind: 'workflow' }, expectCount: 3 },
  { id: 'find-status-pending', filter: { status: 'pending' }, expectKeys: ['status-pending'] },
  { id: 'find-status-done', filter: { status: 'done' }, expectKeys: ['status-done'] },
  { id: 'find-active-true', filter: { active: true }, expectKeys: ['string-basic'] },
  { id: 'find-active-false', filter: { active: false }, expectKeys: ['int-age'] },
  { id: 'find-enabled-true', filter: { enabled: true }, expectKeys: ['bool-true'] },
  { id: 'find-enabled-false', filter: { enabled: false }, expectKeys: ['bool-false'] },
  { id: 'find-null-value', filter: { value: null }, expectKeys: ['null-field'] },
  { id: 'find-name-eq', filter: { name: 'Ada Lovelace' }, expectKeys: ['string-basic'] },
  { id: 'find-name-ne', filter: { name: { $ne: 'Ada Lovelace' } } },
  { id: 'find-score-gt', filter: { score: { $gt: 10 } }, expectKeys: ['status-done'] },
  { id: 'find-score-gte', filter: { score: { $gte: 10 } }, expectKeys: ['status-pending', 'status-done'] },
  { id: 'find-score-lt', filter: { score: { $lt: 10 } }, expectKeys: ['status-archived'] },
  { id: 'find-score-lte', filter: { score: { $lte: 10 } }, expectKeys: ['status-pending', 'status-archived'] },
  { id: 'find-in-status', filter: { status: { $in: ['pending', 'archived'] } }, expectCount: 2 },
  { id: 'find-nin-status', filter: { status: { $nin: ['pending'] }, kind: 'workflow' }, expectCount: 2 },
  { id: 'find-exists-city', filter: { city: { $exists: true } }, expectKeys: ['string-basic'] },
  { id: 'find-exists-false-city', filter: { city: { $exists: false }, kind: 'person' }, expectKeys: ['int-age'] },
  { id: 'find-regex-name', filter: { name: { $regex: '^Ada', $options: 'i' } }, expectKeys: ['string-basic'] },
  { id: 'find-or', filter: { $or: [{ fixtureKey: 'bool-true' }, { fixtureKey: 'bool-false' }] }, expectCount: 2 },
  { id: 'find-and', filter: { $and: [{ kind: 'workflow' }, { status: 'done' }] }, expectKeys: ['status-done'] },
  { id: 'find-nested-bio', filter: { 'user.profile.bio': 'engineer' }, expectKeys: ['nested-object'] },
  { id: 'find-array-elem', filter: { tags: 'beta' }, expectKeys: ['array-strings'] },
  { id: 'find-array-all', filter: { tags: { $all: ['alpha', 'gamma'] } }, expectKeys: ['array-strings'] },
  { id: 'find-lines-sku', filter: { 'lines.sku': 'A' }, expectKeys: ['array-of-objects'] },
  { id: 'find-deep', filter: { 'a.b.c.d': 'leaf' }, expectKeys: ['deep-nest'] },
  { id: 'find-empty-result', filter: { fixtureKey: 'does-not-exist' }, expectCount: 0 },
  // sort / skip / limit / projection
  {
    id: 'find-sort-score-desc',
    filter: { kind: 'workflow' },
    sort: { score: -1 },
    expectKeys: ['status-done', 'status-pending', 'status-archived'],
  },
  {
    id: 'find-sort-score-asc',
    filter: { kind: 'workflow' },
    sort: { score: 1 },
    expectKeys: ['status-archived', 'status-pending', 'status-done'],
  },
  { id: 'find-limit-1', filter: { kind: 'workflow' }, limit: 1, expectCount: 1 },
  { id: 'find-limit-2', filter: { kind: 'workflow' }, limit: 2, expectCount: 2 },
  { id: 'find-skip-1', filter: { kind: 'workflow' }, sort: { score: 1 }, skip: 1, limit: 10, expectCount: 2 },
  { id: 'find-skip-all', filter: { kind: 'workflow' }, skip: 100, expectCount: 0 },
  {
    id: 'find-proj-include',
    filter: { fixtureKey: 'string-basic' },
    projection: { name: 1, fixtureKey: 1 },
  },
  {
    id: 'find-proj-exclude',
    filter: { fixtureKey: 'multi-type' },
    projection: { arr: 0, obj: 0 },
  },
];

/** Expand find cases into more limit/skip variants for case count. */
export function expandFindLimitSkipCases(): FindCase[] {
  const out: FindCase[] = [];
  for (let limit = 1; limit <= 10; limit++) {
    out.push({
      id: `find-limit-matrix-${limit}`,
      filter: {},
      limit,
      sort: { fixtureKey: 1 },
    });
  }
  for (let skip = 0; skip <= 10; skip++) {
    out.push({
      id: `find-skip-matrix-${skip}`,
      filter: {},
      skip,
      limit: 5,
      sort: { fixtureKey: 1 },
    });
  }
  return out;
}

/** UpdateMany cases: filter + update, expected match semantics. */
export type UpdateManyCase = {
  id: string;
  /** Seed docs for this case's private collection (or reuse shared tags) */
  seed: EjsonDoc[];
  filter: unknown;
  update: unknown;
  expectMatched: number;
  /** After update, count matching this filter on field status/value */
  postFilter: unknown;
  postCount: number;
};

export const UPDATE_MANY_CASES: UpdateManyCase[] = [
  {
    id: 'um-set-status',
    seed: [
      { k: 'a', status: 'pending' },
      { k: 'b', status: 'pending' },
      { k: 'c', status: 'done' },
    ],
    filter: { status: 'pending' },
    update: { $set: { status: 'done' } },
    expectMatched: 2,
    postFilter: { status: 'done' },
    postCount: 3,
  },
  {
    id: 'um-inc-score',
    seed: [
      { k: 'a', score: 1 },
      { k: 'b', score: 2 },
      { k: 'c', score: 3 },
    ],
    filter: { score: { $gte: 2 } },
    update: { $inc: { score: 10 } },
    expectMatched: 2,
    postFilter: { score: { $gte: 12 } },
    postCount: 2,
  },
  {
    id: 'um-unset-tmp',
    seed: [
      { k: 'a', tmp: true, keep: 1 },
      { k: 'b', tmp: true, keep: 2 },
    ],
    filter: { tmp: true },
    update: { $unset: { tmp: '' } },
    expectMatched: 2,
    postFilter: { tmp: { $exists: true } },
    postCount: 0,
  },
  {
    id: 'um-no-match',
    seed: [{ k: 'a', status: 'x' }],
    filter: { status: 'zzz' },
    update: { $set: { status: 'y' } },
    expectMatched: 0,
    postFilter: { status: 'x' },
    postCount: 1,
  },
];

/** Generate N similar updateMany cases for volume. */
export function expandUpdateManyCases(n: number): UpdateManyCase[] {
  const out: UpdateManyCase[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `um-batch-${i}`,
      seed: Array.from({ length: 5 }, (_, j) => ({
        batch: i,
        idx: j,
        flag: j % 2 === 0 ? 'even' : 'odd',
        v: j,
      })),
      filter: { batch: i, flag: 'even' },
      update: { $set: { flag: 'marked', batch: i } },
      expectMatched: 3, // idx 0,2,4
      postFilter: { batch: i, flag: 'marked' },
      postCount: 3,
    });
  }
  return out;
}

export function expandDeleteManyCases(n: number): {
  id: string;
  seed: EjsonDoc[];
  filter: unknown;
  expectDeleted: number;
  remain: number;
}[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `dm-batch-${i}`,
      seed: Array.from({ length: 6 }, (_, j) => ({
        batch: i,
        idx: j,
        drop: j < 2,
      })),
      filter: { batch: i, drop: true },
      expectDeleted: 2,
      remain: 4,
    });
  }
  return out;
}

/** Combination flow seeds. */
export const COMBO_FLOWS = Array.from({ length: 30 }, (_, i) => ({
  id: `combo-${i}`,
  initial: { tag: `t${i}`, n: i, status: 'new' as const },
  patchN: i + 100,
  finalStatus: i % 2 === 0 ? 'ok' : 'done',
}));
