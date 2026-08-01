/** Saved collection browser views (columns, sort, filter) — local to this browser. */

export type SortDirection = 1 | -1;

export interface CollectionViewState {
  /** Visible column field names, in display order. Empty = show all discovered. */
  visibleColumns: string[] | null;
  /** Explicitly hidden columns (takes precedence when visibleColumns is null). */
  hiddenColumns: string[];
  /** Column widths in px, keyed by field name. */
  columnWidths: Record<string, number>;
  sortField: string | null;
  sortDir: SortDirection;
  filterJson: string;
}

export interface SavedCollectionView extends CollectionViewState {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionViewStore {
  views: SavedCollectionView[];
  /** Last applied view id for this collection, if any. */
  lastViewId?: string;
}

const STORAGE_PREFIX = 'vast.collectionViews.v1:';

export function collectionViewKey(cid: string, db: string, col: string): string {
  return `${STORAGE_PREFIX}${cid}/${db}/${col}`;
}

export const DEFAULT_COLUMN_WIDTH = 180;
export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 640;

export function defaultViewState(): CollectionViewState {
  return {
    visibleColumns: null,
    hiddenColumns: [],
    columnWidths: {},
    sortField: null,
    sortDir: 1,
    filterJson: '{}',
  };
}

export function clampColumnWidth(w: number): number {
  if (!Number.isFinite(w)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(w)));
}

function normalizeViewState(partial: Partial<CollectionViewState> | SavedCollectionView): CollectionViewState {
  return {
    visibleColumns: partial.visibleColumns ?? null,
    hiddenColumns: partial.hiddenColumns ?? [],
    columnWidths:
      partial.columnWidths && typeof partial.columnWidths === 'object'
        ? Object.fromEntries(
            Object.entries(partial.columnWidths).map(([k, v]) => [k, clampColumnWidth(Number(v))]),
          )
        : {},
    sortField: partial.sortField ?? null,
    sortDir: partial.sortDir === -1 ? -1 : 1,
    filterJson: partial.filterJson ?? '{}',
  };
}

export function loadViewStore(cid: string, db: string, col: string): CollectionViewStore {
  try {
    const raw = localStorage.getItem(collectionViewKey(cid, db, col));
    if (!raw) return { views: [] };
    const parsed = JSON.parse(raw) as CollectionViewStore;
    if (!parsed || !Array.isArray(parsed.views)) return { views: [] };
    return {
      ...parsed,
      views: parsed.views.map((v) => ({
        ...v,
        ...normalizeViewState(v),
      })),
    };
  } catch {
    return { views: [] };
  }
}

export function saveViewStore(
  cid: string,
  db: string,
  col: string,
  store: CollectionViewStore,
): void {
  localStorage.setItem(collectionViewKey(cid, db, col), JSON.stringify(store));
}

export function upsertSavedView(
  cid: string,
  db: string,
  col: string,
  name: string,
  state: CollectionViewState,
  existingId?: string,
): SavedCollectionView {
  const store = loadViewStore(cid, db, col);
  const now = new Date().toISOString();
  const id = existingId ?? crypto.randomUUID();
  const normalized = normalizeViewState(state);
  const view: SavedCollectionView = {
    id,
    name: name.trim() || 'Untitled view',
    ...normalized,
    createdAt: store.views.find((v) => v.id === id)?.createdAt ?? now,
    updatedAt: now,
  };
  const idx = store.views.findIndex((v) => v.id === id);
  if (idx >= 0) store.views[idx] = view;
  else store.views.unshift(view);
  store.lastViewId = id;
  saveViewStore(cid, db, col, store);
  return view;
}

export function deleteSavedView(cid: string, db: string, col: string, id: string): void {
  const store = loadViewStore(cid, db, col);
  store.views = store.views.filter((v) => v.id !== id);
  if (store.lastViewId === id) delete store.lastViewId;
  saveViewStore(cid, db, col, store);
}

export function setLastViewId(cid: string, db: string, col: string, id: string | undefined): void {
  const store = loadViewStore(cid, db, col);
  if (id) store.lastViewId = id;
  else delete store.lastViewId;
  saveViewStore(cid, db, col, store);
}

/**
 * Resolve which columns to render from discovered fields + view state.
 * Always keeps `_id` first when present.
 */
export function resolveVisibleColumns(
  allColumns: string[],
  state: Pick<CollectionViewState, 'visibleColumns' | 'hiddenColumns'>,
): string[] {
  const hidden = new Set(state.hiddenColumns ?? []);
  let cols: string[];
  if (state.visibleColumns && state.visibleColumns.length > 0) {
    // Keep order from view; append any new fields not listed (shown if not hidden)
    const seen = new Set(state.visibleColumns);
    cols = state.visibleColumns.filter((c) => allColumns.includes(c));
    for (const c of allColumns) {
      if (!seen.has(c) && !hidden.has(c)) cols.push(c);
    }
  } else {
    cols = allColumns.filter((c) => !hidden.has(c));
  }
  // Pin _id first
  if (cols.includes('_id')) {
    cols = ['_id', ...cols.filter((c) => c !== '_id')];
  }
  return cols;
}

/** Toggle sort: none → asc → desc → none for a field. */
export function nextSortState(
  currentField: string | null,
  currentDir: SortDirection,
  clickedField: string,
): { sortField: string | null; sortDir: SortDirection } {
  if (currentField !== clickedField) {
    return { sortField: clickedField, sortDir: 1 };
  }
  if (currentDir === 1) {
    return { sortField: clickedField, sortDir: -1 };
  }
  return { sortField: null, sortDir: 1 };
}

export function sortToApi(
  sortField: string | null,
  sortDir: SortDirection,
): Record<string, 1 | -1> | undefined {
  if (!sortField) return undefined;
  return { [sortField]: sortDir };
}
