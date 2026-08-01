import { describe, expect, it, beforeEach } from 'vitest';
import {
  collectionViewKey,
  defaultViewState,
  deleteSavedView,
  loadViewStore,
  nextSortState,
  resolveVisibleColumns,
  saveViewStore,
  sortToApi,
  upsertSavedView,
} from './collection-views';

// minimal localStorage polyfill for node vitest
const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
};
// @ts-expect-error test env
globalThis.localStorage = ls;

describe('collection-views', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('resolveVisibleColumns hides and pins _id', () => {
    const all = ['_id', 'name', 'email', 'age'];
    expect(resolveVisibleColumns(all, { visibleColumns: null, hiddenColumns: ['email'] })).toEqual([
      '_id',
      'name',
      'age',
    ]);
    // _id is always pinned first when present
    expect(
      resolveVisibleColumns(all, { visibleColumns: ['email', 'name'], hiddenColumns: [] }),
    ).toEqual(['_id', 'email', 'name', 'age']);
  });

  it('nextSortState cycles asc → desc → clear', () => {
    expect(nextSortState(null, 1, 'name')).toEqual({ sortField: 'name', sortDir: 1 });
    expect(nextSortState('name', 1, 'name')).toEqual({ sortField: 'name', sortDir: -1 });
    expect(nextSortState('name', -1, 'name')).toEqual({ sortField: null, sortDir: 1 });
    expect(nextSortState('name', 1, 'age')).toEqual({ sortField: 'age', sortDir: 1 });
  });

  it('sortToApi builds mongo sort object', () => {
    expect(sortToApi(null, 1)).toBeUndefined();
    expect(sortToApi('createdAt', -1)).toEqual({ createdAt: -1 });
  });

  it('upsert and load saved views including column widths', () => {
    const state = {
      ...defaultViewState(),
      hiddenColumns: ['secret'],
      columnWidths: { name: 240, email: 320 },
      sortField: 'name',
      sortDir: -1 as const,
      filterJson: '{"active":true}',
    };
    const v = upsertSavedView('c1', 'db', 'col', 'Active users', state);
    expect(v.name).toBe('Active users');
    const store = loadViewStore('c1', 'db', 'col');
    expect(store.views).toHaveLength(1);
    expect(store.views[0]!.hiddenColumns).toEqual(['secret']);
    expect(store.views[0]!.columnWidths).toEqual({ name: 240, email: 320 });
    expect(store.lastViewId).toBe(v.id);

    deleteSavedView('c1', 'db', 'col', v.id);
    expect(loadViewStore('c1', 'db', 'col').views).toHaveLength(0);
  });

  it('collectionViewKey is scoped', () => {
    expect(collectionViewKey('a', 'b', 'c')).toContain('a/b/c');
    saveViewStore('a', 'b', 'c', { views: [] });
    expect(mem.has(collectionViewKey('a', 'b', 'c'))).toBe(true);
  });
});
