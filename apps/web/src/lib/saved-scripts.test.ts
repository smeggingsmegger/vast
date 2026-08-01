import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSavedScript,
  listSavedScripts,
  upsertSavedScript,
} from './saved-scripts';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
});

describe('saved-scripts', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('saves and lists scripts', () => {
    const s = upsertSavedScript({
      name: 'Active users',
      script: 'db.users.find({ status: "active" })',
      cid: 'c1',
      db: 'app',
      col: 'users',
    });
    expect(s.id).toBeTruthy();
    const list = listSavedScripts({ cid: 'c1', db: 'app', col: 'users' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Active users');
  });

  it('updates by id', () => {
    const s = upsertSavedScript({ name: 'A', script: 'db.x.find({})' });
    const u = upsertSavedScript({ id: s.id, name: 'B', script: 'db.x.find({ a: 1 })' });
    expect(u.id).toBe(s.id);
    expect(u.name).toBe('B');
    expect(listSavedScripts()).toHaveLength(1);
  });

  it('deletes', () => {
    const s = upsertSavedScript({ name: 'A', script: 'db.x.find({})' });
    deleteSavedScript(s.id);
    expect(listSavedScripts()).toHaveLength(0);
  });
});
