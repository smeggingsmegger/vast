/**
 * Browser-local saved MongoDB scripts / queries.
 * Scoped optionally per connection+db+collection, or global.
 */

export interface SavedScript {
  id: string;
  name: string;
  script: string;
  /** Optional scope */
  cid?: string;
  db?: string;
  col?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'vast-saved-scripts-v1';

interface ScriptStore {
  scripts: SavedScript[];
}

function loadStore(): ScriptStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { scripts: [] };
    const parsed = JSON.parse(raw) as ScriptStore;
    if (!parsed || !Array.isArray(parsed.scripts)) return { scripts: [] };
    return parsed;
  } catch {
    return { scripts: [] };
  }
}

function saveStore(store: ScriptStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSavedScripts(scope?: { cid?: string; db?: string; col?: string }): SavedScript[] {
  const all = loadStore().scripts;
  if (!scope) return [...all].sort((a, b) => b.updatedAt - a.updatedAt);
  return all
    .filter((s) => {
      // Global scripts (no scope) always included; scoped match exact or parent
      if (!s.cid && !s.db && !s.col) return true;
      if (scope.cid && s.cid && s.cid !== scope.cid) return false;
      if (scope.db && s.db && s.db !== scope.db) return false;
      if (scope.col && s.col && s.col !== scope.col) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertSavedScript(input: {
  id?: string;
  name: string;
  script: string;
  cid?: string;
  db?: string;
  col?: string;
}): SavedScript {
  const store = loadStore();
  const now = Date.now();
  const name = input.name.trim() || 'Untitled script';
  if (input.id) {
    const idx = store.scripts.findIndex((s) => s.id === input.id);
    if (idx >= 0) {
      const next: SavedScript = {
        ...store.scripts[idx],
        name,
        script: input.script,
        cid: input.cid ?? store.scripts[idx].cid,
        db: input.db ?? store.scripts[idx].db,
        col: input.col ?? store.scripts[idx].col,
        updatedAt: now,
      };
      store.scripts[idx] = next;
      saveStore(store);
      return next;
    }
  }
  const created: SavedScript = {
    id: input.id ?? newId(),
    name,
    script: input.script,
    cid: input.cid,
    db: input.db,
    col: input.col,
    createdAt: now,
    updatedAt: now,
  };
  store.scripts.unshift(created);
  saveStore(store);
  return created;
}

export function deleteSavedScript(id: string): void {
  const store = loadStore();
  store.scripts = store.scripts.filter((s) => s.id !== id);
  saveStore(store);
}

export function getSavedScript(id: string): SavedScript | undefined {
  return loadStore().scripts.find((s) => s.id === id);
}
