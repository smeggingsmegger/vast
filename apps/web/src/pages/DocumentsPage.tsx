import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Braces,
  ListTree,
  Bookmark,
  Pencil,
  Copy,
  Braces as BracesIcon,
} from 'lucide-react';
import { api, bsonTypeOf, formatCell, idToPath } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import {
  FieldEditDialog,
  type FieldEditPayload,
} from '@/components/documents/FieldEditDialog';
import {
  QueryEditor,
  type RunAggregatePayload,
  type RunFindPayload,
  type RunScriptPayload,
} from '@/components/documents/QueryEditor';
import {
  QueryResultPanel,
  type QueryResultSummary,
} from '@/components/documents/QueryResultPanel';
import {
  defaultFindScript,
  filterFromParsed,
  isWriteOp,
} from '@/lib/query-script';
import {
  clampColumnWidth,
  DEFAULT_COLUMN_WIDTH,
  deleteSavedView,
  loadViewStore,
  nextSortState,
  resolveVisibleColumns,
  setLastViewId,
  sortToApi,
  upsertSavedView,
  type CollectionViewState,
  type SavedCollectionView,
  type SortDirection,
} from '@/lib/collection-views';
import { copyText, valueAsMongoShell, valueAsString } from '@/lib/copy-value';
import { useTabsStore } from '@/stores/tabs';
import { cn } from '@/lib/utils';

const TYPE_TONES: Record<string, string> = {
  objectId: 'bg-indigo-500/15 text-indigo-300',
  string: 'bg-emerald-500/15 text-emerald-300',
  number: 'bg-amber-500/15 text-amber-300',
  long: 'bg-amber-500/15 text-amber-300',
  decimal: 'bg-amber-500/15 text-amber-300',
  int: 'bg-amber-500/15 text-amber-300',
  double: 'bg-amber-500/15 text-amber-300',
  date: 'bg-sky-500/15 text-sky-300',
  boolean: 'bg-violet-500/15 text-violet-300',
  null: 'bg-zinc-500/15 text-zinc-400',
  array: 'bg-slate-500/15 text-slate-300',
  object: 'bg-slate-500/15 text-slate-300',
};

type Tab = 'documents' | 'indexes' | 'schema' | 'aggregate' | 'import';

class DocumentsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DocumentsPage crash', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm">
          <h2 className="mb-2 font-semibold text-red-300">Failed to render documents</h2>
          <p className="font-mono text-xs text-red-200/90">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-[var(--color-input)] px-3 py-1.5 text-xs"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function DocumentsPage() {
  const { cid = '', db: dbParam = '', col: colParam = '' } = useParams();
  const db = decodeURIComponent(dbParam);
  const col = decodeURIComponent(colParam);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'documents';
  const setTab = (t: Tab) => setSearchParams({ tab: t });
  const openTab = useTabsStore((s) => s.openTab);

  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
    staleTime: 30_000,
  });
  const connectionName = connections.data?.find((c) => c.id === cid)?.name;

  // Keep collection open in the tab strip
  useEffect(() => {
    if (!cid || !db || !col) return;
    openTab({ cid, db, col, connectionName });
  }, [cid, db, col, connectionName, openTab]);

  return (
    <DocumentsErrorBoundary>
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-2 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-fg)]">
              <Link to={`/c/${cid}`} className="hover:text-[var(--color-foreground)]">
                {connectionName ?? 'Connection'}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <Link
                to={`/c/${cid}/db/${encodeURIComponent(db)}`}
                className="hover:text-[var(--color-foreground)]"
              >
                {db}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="font-mono text-[var(--color-foreground)]">{col}</span>
            </div>
            <h1 className="truncate text-lg font-semibold tracking-tight">{col}</h1>
          </div>
          <nav className="flex flex-wrap gap-1">
            {(
              [
                ['documents', 'Documents'],
                ['indexes', 'Indexes'],
                ['schema', 'Schema'],
                ['aggregate', 'Aggregate'],
                ['import', 'Import / Export'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === id
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-card-hover)]',
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'documents' && (
          <div className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <DocumentsPanel
              cid={cid}
              db={db}
              col={col}
              onOpenAggregate={(pipelineJson) => {
                try {
                  sessionStorage.setItem(`vast-agg:${cid}:${db}:${col}`, pipelineJson);
                } catch {
                  // ignore
                }
                setTab('aggregate');
              }}
            />
          </div>
        )}
        {tab === 'indexes' && (
          <div className="min-h-0 flex-1 overflow-auto">
            <IndexesPanel cid={cid} db={db} col={col} />
          </div>
        )}
        {tab === 'schema' && (
          <div className="min-h-0 flex-1 overflow-auto">
            <SchemaPanel cid={cid} db={db} col={col} />
          </div>
        )}
        {tab === 'aggregate' && (
          <div className="min-h-0 flex-1 overflow-auto">
            <AggregatePanel cid={cid} db={db} col={col} />
          </div>
        )}
        {tab === 'import' && (
          <div className="min-h-0 flex-1 overflow-auto">
            <ImportExportPanel cid={cid} db={db} col={col} />
          </div>
        )}
      </div>
    </div>
    </DocumentsErrorBoundary>
  );
}

function DocumentsPanel({
  cid,
  db,
  col,
  onOpenAggregate,
}: {
  cid: string;
  db: string;
  col: string;
  onOpenAggregate?: (pipelineJson: string) => void;
}) {
  const qc = useQueryClient();
  const [script, setScript] = useState(() => defaultFindScript(col));
  const [filterText, setFilterText] = useState('{}');
  const [appliedFilter, setAppliedFilter] = useState<unknown>({});
  const [appliedProjection, setAppliedProjection] = useState<
    Record<string, 0 | 1> | undefined
  >();
  const [appliedSort, setAppliedSort] = useState<Record<string, 1 | -1> | undefined>({
    _id: -1,
  });
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [queryResult, setQueryResult] = useState<QueryResultSummary | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [runningScript, setRunningScript] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [editMode, setEditMode] = useState<'tree' | 'json'>('json');
  const [jsonText, setJsonText] = useState('');
  const [showInsert, setShowInsert] = useState(false);
  const [insertText, setInsertText] = useState('{\n  \n}');
  const [convertPath, setConvertPath] = useState<string | null>(null);
  const [convertType, setConvertType] = useState('string');
  const [fieldEdit, setFieldEdit] = useState<{ path: string; value: unknown } | null>(null);

  // Column / sort / views
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [sortField, setSortField] = useState<string | null>('_id');
  const [sortDir, setSortDir] = useState<SortDirection>(-1);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedCollectionView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    field: string;
    value: unknown;
  } | null>(null);

  // Load saved views when collection changes
  useEffect(() => {
    const store = loadViewStore(cid, db, col);
    setSavedViews(store.views);
    // Reset view UI state for new collection
    setHiddenColumns([]);
    setVisibleColumns(null);
    setColumnWidths({});
    setSortField('_id');
    setSortDir(-1);
    setActiveViewId(null);
    setShowColumnsMenu(false);
    setShowViewsMenu(false);
    setContextMenu(null);
    setScript(defaultFindScript(col));
    setFilterText('{}');
    setAppliedFilter({});
    setAppliedProjection(undefined);
    setAppliedSort({ _id: -1 });
    setSkip(0);
    setLimit(50);
    setQueryResult(null);
    setSelected(null);
  }, [cid, db, col]);

  // Close context menu on escape / scroll
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  const docs = useQuery({
    queryKey: [
      'docs',
      cid,
      db,
      col,
      appliedFilter,
      appliedProjection,
      appliedSort,
      skip,
      limit,
    ],
    queryFn: () =>
      api.find(cid, db, col, {
        filter: appliedFilter,
        projection: appliedProjection,
        skip,
        limit: Math.min(Math.max(limit || 50, 1), 1000),
        sort: appliedSort,
      }),
  });

  const allColumns = useMemo(() => {
    const keys = new Set<string>(['_id']);
    for (const d of docs.data?.data ?? []) {
      Object.keys(d).forEach((k) => keys.add(k));
    }
    // Prefer stable order: _id first, then alphabetical
    const list = [...keys];
    list.sort((a, b) => {
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      return a.localeCompare(b);
    });
    return list;
  }, [docs.data]);

  const columns = useMemo(
    () => resolveVisibleColumns(allColumns, { visibleColumns, hiddenColumns }),
    [allColumns, visibleColumns, hiddenColumns],
  );

  function currentViewState(): CollectionViewState {
    return {
      visibleColumns,
      hiddenColumns,
      columnWidths,
      sortField,
      sortDir,
      filterJson: filterText,
    };
  }

  function applyViewState(state: CollectionViewState, viewId?: string | null) {
    setVisibleColumns(state.visibleColumns);
    setHiddenColumns(state.hiddenColumns ?? []);
    setColumnWidths(state.columnWidths ?? {});
    setSortField(state.sortField);
    setSortDir(state.sortDir ?? 1);
    setAppliedSort(sortToApi(state.sortField, state.sortDir ?? 1));
    setFilterText(state.filterJson ?? '{}');
    try {
      setAppliedFilter(JSON.parse(state.filterJson || '{}'));
    } catch {
      setAppliedFilter({});
    }
    setSkip(0);
    setActiveViewId(viewId ?? null);
  }

  function colWidth(field: string): number {
    return clampColumnWidth(columnWidths[field] ?? DEFAULT_COLUMN_WIDTH);
  }

  function startResize(field: string, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidth(field);
    const onMove = (ev: MouseEvent) => {
      const next = clampColumnWidth(startW + (ev.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [field]: next }));
      setActiveViewId(null);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function copyValue(kind: 'string' | 'mongo', value: unknown) {
    const text = kind === 'string' ? valueAsString(value) : valueAsMongoShell(value);
    try {
      await copyText(text);
      toast.success(kind === 'string' ? 'Copied as string' : 'Copied as Mongo value');
    } catch {
      toast.error('Could not copy to clipboard');
    }
    setContextMenu(null);
  }

  function refreshViewsList() {
    const store = loadViewStore(cid, db, col);
    setSavedViews(store.views);
  }

  async function handleRunFind(payload: RunFindPayload) {
    setActiveViewId(null);
    if (payload.kind === 'count') {
      try {
        const started = Date.now();
        const res = await api.count(cid, db, col, payload.filter);
        setQueryResult({
          kind: 'count',
          op: 'countDocuments',
          title: `${res.data.count.toLocaleString()} document${res.data.count === 1 ? '' : 's'} match`,
          stats: [{ label: 'count', value: res.data.count, tone: 'accent' }],
          matchCount: res.data.count,
          executionMs: Date.now() - started,
        });
        toast.success(`Count: ${res.data.count}`);
      } catch (e) {
        setQueryResult({
          kind: 'error',
          op: 'countDocuments',
          title: e instanceof Error ? e.message : 'Count failed',
        });
        toast.error(e instanceof Error ? e.message : 'Count failed');
      }
      return;
    }
    setAppliedFilter(payload.filter ?? {});
    setFilterText(JSON.stringify(payload.filter ?? {}, null, 2));
    setAppliedProjection(
      payload.projection && Object.keys(payload.projection).length
        ? payload.projection
        : undefined,
    );
    if (payload.sort && Object.keys(payload.sort).length > 0) {
      setAppliedSort(payload.sort);
      const [field, dir] = Object.entries(payload.sort)[0];
      setSortField(field);
      setSortDir(dir === -1 ? -1 : 1);
    } else {
      setAppliedSort(undefined);
      setSortField(null);
      setSortDir(1);
    }
    setSkip(payload.skip ?? 0);
    if (payload.kind === 'findOne') {
      setLimit(1);
    } else {
      const lim = payload.limit && payload.limit > 0 ? payload.limit : 50;
      setLimit(Math.min(lim, 1000));
    }
    // Enrich with total match count in background
    void (async () => {
      try {
        const [countRes, previewRes] = await Promise.all([
          api.count(cid, db, col, payload.filter),
          api.preview(cid, db, col, { filter: payload.filter, sampleSize: 5 }),
        ]);
        setQueryResult({
          kind: 'find',
          op: payload.kind,
          title:
            payload.kind === 'findOne'
              ? 'findOne — loading into grid'
              : `Find results in grid below`,
          details: [
            `${countRes.data.count.toLocaleString()} total match${countRes.data.count === 1 ? '' : 'es'} (before skip/limit)`,
          ],
          stats: [
            { label: 'matched', value: countRes.data.count, tone: 'accent' },
            {
              label: 'page limit',
              value: payload.kind === 'findOne' ? 1 : payload.limit && payload.limit > 0 ? payload.limit : 50,
            },
          ],
          matchCount: countRes.data.count,
          sample: previewRes.data.sample,
          executionMs: previewRes.data.executionMs,
        });
      } catch {
        setQueryResult({
          kind: 'find',
          op: payload.kind,
          title: 'Query running — results in grid',
        });
      }
    })();
  }

  function handleRunAggregate(payload: RunAggregatePayload) {
    const json = JSON.stringify(payload.pipeline, null, 2);
    if (onOpenAggregate) {
      onOpenAggregate(json);
      toast.message('Opened Aggregate tab with pipeline from script');
    } else {
      toast.message('Switch to the Aggregate tab to run pipelines');
    }
  }

  async function handlePreviewScript(parsed: RunScriptPayload) {
    const filter = filterFromParsed(parsed);
    if (filter === null) {
      toast.message('This operation has no filter to preview');
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.preview(cid, db, col, { filter, sampleSize: 8 });
      const n = res.data.matchCount;
      const write = isWriteOp(parsed.kind);
      setQueryResult({
        kind: 'preview',
        op: parsed.kind,
        title: write
          ? `Would affect ${n.toLocaleString()} document${n === 1 ? '' : 's'}`
          : `${n.toLocaleString()} document${n === 1 ? '' : 's'} match this filter`,
        details: write
          ? [
              'This is a dry-run — nothing was changed.',
              parsed.kind.startsWith('update')
                ? 'Execute to apply the update to matching documents.'
                : 'Execute to delete matching documents.',
              parsed.kind === 'updateOne' || parsed.kind === 'deleteOne'
                ? 'Note: updateOne/deleteOne only touches the first match.'
                : '',
            ].filter(Boolean)
          : ['Preview only — use Run to load results into the grid.'],
        stats: [
          { label: 'would match', value: n, tone: n > 0 ? 'accent' : 'warning' },
          ...(parsed.kind === 'updateOne' || parsed.kind === 'deleteOne'
            ? [{ label: 'op limit', value: 1, tone: 'default' as const }]
            : []),
        ],
        matchCount: n,
        sample: res.data.sample,
        executionMs: res.data.executionMs,
        isDryRun: true,
      });
      if (n === 0) toast.message('No documents match');
      else toast.message(`${n} would match`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Preview failed';
      setQueryResult({ kind: 'error', op: parsed.kind, title: msg });
      toast.error(msg);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleRunScript(parsed: RunScriptPayload) {
    if (parsed.kind === 'find' || parsed.kind === 'findOne' || parsed.kind === 'count') {
      await handleRunFind({
        kind: parsed.kind,
        filter: parsed.filter,
        projection: parsed.projection,
        sort: parsed.sort,
        skip: parsed.skip,
        limit: parsed.kind === 'findOne' ? 1 : parsed.limit,
      });
      return;
    }
    if (parsed.kind === 'aggregate') {
      handleRunAggregate({ kind: 'aggregate', pipeline: parsed.pipeline });
      return;
    }

    // Writes: confirm with match count first
    setRunningScript(true);
    try {
      if (
        parsed.kind === 'updateOne' ||
        parsed.kind === 'updateMany' ||
        parsed.kind === 'deleteOne' ||
        parsed.kind === 'deleteMany'
      ) {
        const preview = await api.preview(cid, db, col, {
          filter: parsed.filter,
          sampleSize: 5,
        });
        const n = preview.data.matchCount;
        const oneOnly = parsed.kind === 'updateOne' || parsed.kind === 'deleteOne';
        const affect = oneOnly ? Math.min(1, n) : n;
        if (n === 0) {
          setQueryResult({
            kind: 'preview',
            op: parsed.kind,
            title: 'No documents match — nothing to do',
            stats: [{ label: 'matched', value: 0, tone: 'warning' }],
            matchCount: 0,
            sample: [],
            isDryRun: true,
            executionMs: preview.data.executionMs,
          });
          toast.message('No matches');
          return;
        }
        const verb =
          parsed.kind === 'updateOne' || parsed.kind === 'updateMany' ? 'update' : 'delete';
        const ok = window.confirm(
          `About to ${verb} ${affect.toLocaleString()} document${affect === 1 ? '' : 's'}` +
            (oneOnly && n > 1 ? ` (first of ${n.toLocaleString()} matches)` : '') +
            `.\n\nThis cannot be undone from Vast. Continue?`,
        );
        if (!ok) {
          setQueryResult({
            kind: 'preview',
            op: parsed.kind,
            title: `Cancelled — would have affected ${affect.toLocaleString()}`,
            stats: [{ label: 'would match', value: n, tone: 'accent' }],
            matchCount: n,
            sample: preview.data.sample,
            isDryRun: true,
            executionMs: preview.data.executionMs,
          });
          return;
        }

        if (parsed.kind === 'updateOne') {
          const res = await api.updateOneByFilter(cid, db, col, {
            filter: parsed.filter,
            update: parsed.update,
            upsert: parsed.upsert,
          });
          setQueryResult({
            kind: 'write',
            op: 'updateOne',
            title: `Updated ${res.data.modifiedCount} document${res.data.modifiedCount === 1 ? '' : 's'}`,
            stats: [
              { label: 'matched', value: res.data.matchedCount, tone: 'accent' },
              { label: 'modified', value: res.data.modifiedCount, tone: 'success' },
              ...(res.data.upsertedCount
                ? [{ label: 'upserted', value: res.data.upsertedCount, tone: 'success' as const }]
                : []),
            ],
            sample: preview.data.sample,
          });
          toast.success(
            `matched ${res.data.matchedCount}, modified ${res.data.modifiedCount}`,
          );
        } else if (parsed.kind === 'updateMany') {
          const res = await api.updateManyByFilter(cid, db, col, {
            filter: parsed.filter,
            update: parsed.update,
          });
          setQueryResult({
            kind: 'write',
            op: 'updateMany',
            title: `Modified ${res.data.modifiedCount.toLocaleString()} of ${res.data.matchedCount.toLocaleString()} matched`,
            stats: [
              { label: 'matched', value: res.data.matchedCount, tone: 'accent' },
              { label: 'modified', value: res.data.modifiedCount, tone: 'success' },
            ],
            sample: preview.data.sample,
          });
          toast.success(
            `matched ${res.data.matchedCount}, modified ${res.data.modifiedCount}`,
          );
        } else if (parsed.kind === 'deleteOne') {
          const res = await api.deleteOneByFilter(cid, db, col, parsed.filter);
          setQueryResult({
            kind: 'write',
            op: 'deleteOne',
            title: res.data.deletedCount
              ? 'Deleted 1 document'
              : 'No document deleted',
            stats: [
              { label: 'matched', value: res.data.matchedCount, tone: 'accent' },
              { label: 'deleted', value: res.data.deletedCount, tone: 'danger' },
            ],
          });
          toast.success(`deleted ${res.data.deletedCount}`);
        } else if (parsed.kind === 'deleteMany') {
          const res = await api.deleteManyByFilter(cid, db, col, parsed.filter);
          setQueryResult({
            kind: 'write',
            op: 'deleteMany',
            title: `Deleted ${res.data.deletedCount.toLocaleString()} document${res.data.deletedCount === 1 ? '' : 's'}`,
            stats: [
              { label: 'matched', value: res.data.matchedCount, tone: 'accent' },
              { label: 'deleted', value: res.data.deletedCount, tone: 'danger' },
            ],
          });
          toast.success(`deleted ${res.data.deletedCount}`);
        }
        void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
        return;
      }

      if (parsed.kind === 'insertOne') {
        const res = await api.insertDocument(cid, db, col, parsed.document);
        setQueryResult({
          kind: 'write',
          op: 'insertOne',
          title: 'Inserted 1 document',
          stats: [{ label: 'inserted', value: 1, tone: 'success' }],
          sample: [res.data as Record<string, unknown>],
        });
        toast.success('Inserted');
        void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
        return;
      }

      if (parsed.kind === 'insertMany') {
        const res = await api.insertMany(cid, db, col, parsed.documents);
        setQueryResult({
          kind: 'write',
          op: 'insertMany',
          title: `Inserted ${res.data.insertedCount} document${res.data.insertedCount === 1 ? '' : 's'}`,
          stats: [{ label: 'inserted', value: res.data.insertedCount, tone: 'success' }],
        });
        toast.success(`Inserted ${res.data.insertedCount}`);
        void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
        return;
      }

      toast.error('Unsupported operation');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Operation failed';
      setQueryResult({ kind: 'error', op: parsed.kind, title: msg });
      toast.error(msg);
    } finally {
      setRunningScript(false);
    }
  }

  function toggleColumn(field: string) {
    if (field === '_id') return; // always show _id
    setHiddenColumns((prev) => {
      if (prev.includes(field)) return prev.filter((f) => f !== field);
      return [...prev, field];
    });
    // If using explicit visible list, also update it
    setVisibleColumns((prev) => {
      if (!prev) return prev;
      if (prev.includes(field)) return prev.filter((f) => f !== field);
      return [...prev, field];
    });
    setActiveViewId(null);
  }

  function onHeaderClick(field: string) {
    const next = nextSortState(sortField, sortDir, field);
    setSortField(next.sortField);
    setSortDir(next.sortDir);
    setAppliedSort(sortToApi(next.sortField, next.sortDir));
    setSkip(0);
    setActiveViewId(null);
  }

  function handleSaveView() {
    const view = upsertSavedView(cid, db, col, saveViewName, currentViewState());
    refreshViewsList();
    setActiveViewId(view.id);
    setSaveViewOpen(false);
    setSaveViewName('');
    toast.success(`View “${view.name}” saved`);
  }

  function handleApplyView(view: SavedCollectionView) {
    applyViewState(view, view.id);
    setLastViewId(cid, db, col, view.id);
    refreshViewsList();
    setShowViewsMenu(false);
    toast.message(`Applied view “${view.name}”`);
  }

  function handleDeleteView(id: string) {
    deleteSavedView(cid, db, col, id);
    if (activeViewId === id) setActiveViewId(null);
    refreshViewsList();
    toast.message('View deleted');
  }

  const saveJson = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No document');
      const doc = JSON.parse(jsonText);
      const id = idToPath(selected._id);
      return api.replaceDocument(cid, db, col, id, doc);
    },
    onSuccess: (res) => {
      toast.success('Document saved');
      setSelected(res.data);
      setJsonText(JSON.stringify(res.data, null, 2));
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insert = useMutation({
    mutationFn: async () => {
      const doc = JSON.parse(insertText);
      return api.insertDocument(cid, db, col, doc);
    },
    onSuccess: () => {
      toast.success('Document inserted');
      setShowInsert(false);
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No document');
      return api.deleteDocument(cid, db, col, idToPath(selected._id));
    },
    onSuccess: () => {
      toast.success('Deleted');
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!selected || !convertPath) throw new Error('missing');
      return api.convertField(cid, db, col, idToPath(selected._id), convertPath, convertType);
    },
    onSuccess: (res) => {
      toast.success('Field type converted');
      setSelected(res.data);
      setJsonText(JSON.stringify(res.data, null, 2));
      setConvertPath(null);
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFieldMut = useMutation({
    mutationFn: async (payload: FieldEditPayload) => {
      if (!selected) throw new Error('No document selected');
      return api.setField(cid, db, col, idToPath(selected._id), payload);
    },
    onSuccess: (res) => {
      toast.success('Field updated');
      setSelected(res.data);
      setJsonText(JSON.stringify(res.data, null, 2));
      setFieldEdit(null);
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openDoc(doc: Record<string, unknown>) {
    setSelected(doc);
    setJsonText(JSON.stringify(doc, null, 2));
    setEditMode('tree');
  }

  function openFieldEdit(path: string, value: unknown) {
    if (path === '_id') {
      toast.message('_id cannot be edited in place');
      return;
    }
    if (!selected) {
      toast.error('Select a document first');
      return;
    }
    setFieldEdit({ path, value });
  }

  function getNested(doc: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = doc;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* Left: toolbar + grid. Column mode: h-0+flex-1 caps height. Row mode: stretch via min-h-0. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-border)]">
        <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] p-3">
          <QueryEditor
            cid={cid}
            db={db}
            col={col}
            script={script}
            onScriptChange={setScript}
            onRunFind={(p) => void handleRunFind(p)}
            onRunAggregate={handleRunAggregate}
            onRunScript={(p) => void handleRunScript(p)}
            onPreviewScript={(p) => void handlePreviewScript(p)}
            running={docs.isFetching || runningScript}
            previewing={previewing}
            fieldSuggestions={allColumns}
          />
          <QueryResultPanel result={queryResult} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setShowInsert(true)}>
              <Plus className="h-3.5 w-3.5" />
              Insert
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowColumnsMenu((v) => !v);
                  setShowViewsMenu(false);
                }}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
                {hiddenColumns.length > 0 && (
                  <Badge tone="accent" className="ml-1">
                    −{hiddenColumns.length}
                  </Badge>
                )}
              </Button>
              {showColumnsMenu && (
                <div className="absolute left-0 z-30 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-xl">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-[var(--color-muted)]">
                      Show / hide fields
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--color-accent)]"
                      onClick={() => {
                        setHiddenColumns([]);
                        setVisibleColumns(null);
                        setActiveViewId(null);
                      }}
                    >
                      Show all
                    </button>
                  </div>
                  {allColumns.length === 0 && (
                    <p className="px-1 py-2 text-xs text-[var(--color-muted-fg)]">Load documents first</p>
                  )}
                  {allColumns.map((field) => {
                    const checked = columns.includes(field);
                    return (
                      <label
                        key={field}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--color-card-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={field === '_id'}
                          onChange={() => toggleColumn(field)}
                          className="rounded border-[var(--color-border)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono">{field}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  refreshViewsList();
                  setShowViewsMenu((v) => !v);
                  setShowColumnsMenu(false);
                }}
              >
                <Bookmark className="h-3.5 w-3.5" />
                Views
                {activeViewId && <Badge tone="accent" className="ml-1">on</Badge>}
              </Button>
              {showViewsMenu && (
                <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-xl">
                  <button
                    type="button"
                    className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-card-hover)]"
                    onClick={() => {
                      setSaveViewName(activeViewId ? savedViews.find((v) => v.id === activeViewId)?.name ?? '' : '');
                      setSaveViewOpen(true);
                      setShowViewsMenu(false);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Save current as view…
                  </button>
                  {savedViews.length === 0 && (
                    <p className="px-2 py-2 text-[11px] text-[var(--color-muted-fg)]">
                      No saved views yet. Configure columns/sort/filter, then save.
                    </p>
                  )}
                  <ul className="max-h-48 space-y-0.5 overflow-auto">
                    {savedViews.map((view) => (
                      <li
                        key={view.id}
                        className={cn(
                          'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs',
                          activeViewId === view.id && 'bg-[var(--color-accent-soft)]',
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left hover:text-[var(--color-accent)]"
                          onClick={() => handleApplyView(view)}
                        >
                          {view.name}
                          {view.sortField && (
                            <span className="ml-1 text-[10px] text-[var(--color-muted-fg)]">
                              · {view.sortField}
                              {view.sortDir === -1 ? ' ↓' : ' ↑'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--color-muted-fg)] hover:bg-[var(--color-card-hover)] hover:text-red-400"
                          aria-label={`Delete view ${view.name}`}
                          onClick={() => handleDeleteView(view.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {docs.data && (
              <span className="font-mono text-[11px] text-[var(--color-muted-fg)]">
                showing {docs.data.page.returned}
                {queryResult?.matchCount != null
                  ? ` of ${queryResult.matchCount.toLocaleString()} matched`
                  : ' rows'}
                {' · '}
                {docs.data.page.executionMs}ms
                {docs.data.page.hasMore ? ' · more…' : ''}
                {sortField && ` · sort ${sortField}${sortDir === -1 ? ' desc' : ' asc'}`}
              </span>
            )}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void docs.refetch();
              }}
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', docs.isFetching && 'animate-spin')} />
            </Button>
            <Button size="sm" variant="ghost" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - limit))}>
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!docs.data?.page.hasMore}
              onClick={() => setSkip(skip + limit)}
            >
              Next
            </Button>
          </div>
        </div>

        {/*
          Scrollport owns both axes. h-0 + flex-1 is the reliable flex height cap so
          overflow-auto pins the horizontal scrollbar to the bottom of this pane
          (not under the full table height).
        */}
        <div className="relative flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Click-away for menus */}
          {(showColumnsMenu || showViewsMenu) && (
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label="Close menus"
              onClick={() => {
                setShowColumnsMenu(false);
                setShowViewsMenu(false);
              }}
            />
          )}

          <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
            {docs.isLoading && (
              <div className="flex items-center gap-2 p-6 text-sm text-[var(--color-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
              </div>
            )}
            {docs.isError && (
              <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {(docs.error as Error).message}
              </div>
            )}
            {docs.data && docs.data.data.length === 0 && (
              <div className="p-12 text-center text-sm text-[var(--color-muted)]">
                No documents match this filter.
                <div className="mt-2 text-xs text-[var(--color-muted-fg)]">
                  Try clearing the filter or insert a document.
                </div>
              </div>
            )}
            {docs.data && docs.data.data.length > 0 && (
              <table className="w-max min-w-full table-fixed border-collapse text-left text-xs">
                <colgroup>
                  {columns.map((c) => (
                    <col key={c} style={{ width: colWidth(c) }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[var(--color-sidebar)]">
                  <tr>
                    {columns.map((c) => {
                      const isSorted = sortField === c;
                      return (
                        <th
                          key={c}
                          className={cn(
                            'relative sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-3 py-2 font-medium',
                            'cursor-pointer select-none hover:text-[var(--color-accent)]',
                            isSorted ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]',
                          )}
                          style={{
                            width: colWidth(c),
                            minWidth: colWidth(c),
                            maxWidth: colWidth(c),
                          }}
                          onClick={() => onHeaderClick(c)}
                          title="Click to sort · drag edge to resize"
                        >
                          <span className="inline-flex max-w-full items-center gap-1 truncate pr-2">
                            <span className="truncate">{c}</span>
                            {isSorted && sortDir === 1 && (
                              <ChevronUp className="h-3 w-3 shrink-0" />
                            )}
                            {isSorted && sortDir === -1 && (
                              <ChevronDown className="h-3 w-3 shrink-0" />
                            )}
                          </span>
                          <span
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${c} column`}
                            className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60"
                            onMouseDown={(e) => startResize(c, e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {docs.data.data.map((doc, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'group/row cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-card-hover)]',
                        selected &&
                          idToPath(selected._id) === idToPath(doc._id) &&
                          'bg-[var(--color-accent-soft)]',
                      )}
                      onClick={() => openDoc(doc)}
                    >
                      {columns.map((c) => (
                        <td
                          key={c}
                          className="group/cell relative overflow-hidden px-3 py-2 font-mono"
                          style={{
                            width: colWidth(c),
                            minWidth: colWidth(c),
                            maxWidth: colWidth(c),
                          }}
                          title={
                            c === '_id'
                              ? 'Right-click to copy'
                              : 'Double-click to edit · right-click to copy'
                          }
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            openDoc(doc);
                            if (c !== '_id') openFieldEdit(c, doc[c]);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              field: c,
                              value: doc[c],
                            });
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-1">
                            <span
                              className={cn(
                                'inline-block shrink-0 rounded px-1 text-[10px]',
                                TYPE_TONES[bsonTypeOf(doc[c])] ?? TYPE_TONES.object,
                              )}
                            >
                              {bsonTypeOf(doc[c]).slice(0, 3)}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{formatCell(doc[c])}</span>
                            <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover/cell:inline-flex">
                              <button
                                type="button"
                                className="rounded p-0.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-input)] hover:text-[var(--color-accent)]"
                                title="Copy as string"
                                aria-label={`Copy ${c} as string`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyValue('string', doc[c]);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-0.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-input)] hover:text-[var(--color-accent)]"
                                title='Copy as Mongo value (ObjectId("…"))'
                                aria-label={`Copy ${c} as Mongo shell value`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyValue('mongo', doc[c]);
                                }}
                              >
                                <BracesIcon className="h-3 w-3" />
                              </button>
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {contextMenu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close context menu"
                onClick={() => setContextMenu(null)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu(null);
                }}
              />
              <div
                role="menu"
                className="fixed z-50 min-w-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl"
                style={{
                  left: Math.min(contextMenu.x, window.innerWidth - 220),
                  top: Math.min(contextMenu.y, window.innerHeight - 160),
                }}
              >
                <div className="border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-muted-fg)]">
                  {contextMenu.field}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)]"
                  onClick={() => void copyValue('string', contextMenu.value)}
                >
                  <Copy className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                  Copy as string
                  <span className="ml-auto max-w-[100px] truncate font-mono text-[10px] text-[var(--color-muted-fg)]">
                    {valueAsString(contextMenu.value)}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)]"
                  onClick={() => void copyValue('mongo', contextMenu.value)}
                >
                  <BracesIcon className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                  Copy as Mongo value
                </button>
                <div className="border-t border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-muted-fg)]">
                  {valueAsMongoShell(contextMenu.value)}
                </div>
                {contextMenu.field !== '_id' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-left text-xs hover:bg-[var(--color-card-hover)]"
                    onClick={() => {
                      if (selected) openFieldEdit(contextMenu.field, contextMenu.value);
                      setContextMenu(null);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                    Edit field…
                  </button>
                )}
              </div>
            </>
          )}

          <p className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[11px] text-[var(--color-muted-fg)]">
            Drag column edges to resize · right-click or hover icons to copy · headers sort · Views
            save widths
          </p>
        </div>
      </div>

      <aside className="flex w-full min-h-0 shrink-0 flex-col overflow-hidden border-t border-[var(--color-border)] lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-[var(--color-muted)]">
            <Braces className="mb-3 h-8 w-8 opacity-40" />
            Select a document to inspect and edit
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] p-2">
              <Button
                size="sm"
                variant={editMode === 'json' ? 'primary' : 'ghost'}
                onClick={() => setEditMode('json')}
              >
                <Braces className="h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                size="sm"
                variant={editMode === 'tree' ? 'primary' : 'ghost'}
                onClick={() => setEditMode('tree')}
              >
                <ListTree className="h-3.5 w-3.5" />
                Fields
              </Button>
              <div className="flex-1" />
              {editMode === 'json' && (
                <Button size="sm" onClick={() => saveJson.mutate()} disabled={saveJson.isPending}>
                  Save
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm('Delete this document?')) remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
              </Button>
            </div>
            {editMode === 'json' ? (
              <textarea
                className="min-h-0 flex-1 resize-none bg-[var(--color-background)] p-3 font-mono text-xs leading-relaxed outline-none"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                aria-label="Document JSON"
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <FieldTree
                  doc={selected}
                  onConvert={(path) => {
                    setConvertPath(path);
                    setConvertType('string');
                  }}
                  onEdit={(path, value) => openFieldEdit(path, value)}
                  onCopyString={(value) => void copyValue('string', value)}
                  onCopyMongo={(value) => void copyValue('mongo', value)}
                />
              </div>
            )}
          </>
        )}
      </aside>

      <FieldEditDialog
        open={!!fieldEdit}
        path={fieldEdit?.path ?? ''}
        currentValue={
          fieldEdit && selected ? getNested(selected, fieldEdit.path) : fieldEdit?.value
        }
        saving={setFieldMut.isPending}
        onClose={() => setFieldEdit(null)}
        onSave={(payload) => setFieldMut.mutate(payload)}
      />

      <Dialog
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title="Save collection view"
      >
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Saves visible columns, sort, and filter for this collection on this browser.
        </p>
        <Input
          autoFocus
          placeholder="View name"
          value={saveViewName}
          onChange={(e) => setSaveViewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && saveViewName.trim()) handleSaveView();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSaveViewOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!saveViewName.trim()} onClick={handleSaveView}>
            Save view
          </Button>
        </div>
      </Dialog>

      <Dialog open={showInsert} onClose={() => setShowInsert(false)} title="Insert document" className="max-w-xl">
        <textarea
          className="min-h-[200px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
          value={insertText}
          onChange={(e) => setInsertText(e.target.value)}
          spellCheck={false}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowInsert(false)}>
            Cancel
          </Button>
          <Button onClick={() => insert.mutate()} disabled={insert.isPending}>
            Insert
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!convertPath} onClose={() => setConvertPath(null)} title="Convert field type">
        <p className="text-sm text-[var(--color-muted)]">
          Convert <code className="font-mono text-[var(--color-foreground)]">{convertPath}</code>
        </p>
        <select
          className="mt-3 h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-sm"
          value={convertType}
          onChange={(e) => setConvertType(e.target.value)}
        >
          {['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'null'].map(
            (t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ),
          )}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConvertPath(null)}>
            Cancel
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            Convert
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function FieldTree({
  doc,
  path = '',
  onConvert,
  onEdit,
  onCopyString,
  onCopyMongo,
}: {
  doc: unknown;
  path?: string;
  onConvert: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
  onCopyString: (value: unknown) => void;
  onCopyMongo: (value: unknown) => void;
}) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return (
      <div className="flex items-center gap-2 py-1 font-mono text-xs">
        <Badge className={TYPE_TONES[bsonTypeOf(doc)]}>{bsonTypeOf(doc)}</Badge>
        <span className="truncate">{formatCell(doc)}</span>
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {Object.entries(doc as Record<string, unknown>).map(([k, v]) => {
        const p = path ? `${path}.${k}` : k;
        const isLeaf =
          v === null ||
          typeof v !== 'object' ||
          Array.isArray(v) ||
          (typeof v === 'object' &&
            v !== null &&
            ('$oid' in v ||
              '$date' in v ||
              '$numberLong' in v ||
              '$numberDecimal' in v ||
              '$numberInt' in v ||
              '$numberDouble' in v));
        return (
          <li
            key={p}
            className="group/field rounded-lg border border-[var(--color-border)]/60 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-[var(--color-accent)]">{k}</span>
              <Badge className={TYPE_TONES[bsonTypeOf(v)]}>{bsonTypeOf(v)}</Badge>
              {isLeaf && (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-muted)]">
                    {formatCell(v)}
                  </span>
                  <span className="hidden items-center gap-0.5 group-hover/field:inline-flex">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      aria-label={`Copy ${p} as string`}
                      title="Copy as string"
                      onClick={() => onCopyString(v)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5"
                      aria-label={`Copy ${p} as Mongo value`}
                      title="Copy as Mongo value"
                      onClick={() => onCopyMongo(v)}
                    >
                      <BracesIcon className="h-3 w-3" />
                    </Button>
                  </span>
                  {p !== '_id' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      aria-label={`Edit ${p}`}
                      onClick={() => onEdit(p, v)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => onConvert(p)}>
                    type
                  </Button>
                </>
              )}
            </div>
            {!isLeaf && (
              <div className="ml-3 mt-1 border-l border-[var(--color-border)] pl-2">
                <FieldTree
                  doc={v}
                  path={p}
                  onConvert={onConvert}
                  onEdit={onEdit}
                  onCopyString={onCopyString}
                  onCopyMongo={onCopyMongo}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function IndexesPanel({ cid, db, col }: { cid: string; db: string; col: string }) {
  const qc = useQueryClient();
  const [keys, setKeys] = useState('{"name":1}');
  const [name, setName] = useState('');
  const list = useQuery({
    queryKey: ['indexes', cid, db, col],
    queryFn: async () => (await api.listIndexes(cid, db, col)).data,
  });
  const create = useMutation({
    mutationFn: async () => {
      const k = JSON.parse(keys) as Record<string, number | string>;
      return api.createIndex(cid, db, col, k, name ? { name } : undefined);
    },
    onSuccess: () => {
      toast.success('Index created');
      void qc.invalidateQueries({ queryKey: ['indexes', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const drop = useMutation({
    mutationFn: (n: string) => api.dropIndex(cid, db, col, n),
    onSuccess: () => {
      toast.success('Index dropped');
      void qc.invalidateQueries({ queryKey: ['indexes', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 className="mb-2 text-sm font-semibold">Create index</h3>
        <Input
          className="mb-2 font-mono text-xs"
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
          placeholder='{"field":1}'
        />
        <Input
          className="mb-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="optional name"
        />
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          Create
        </Button>
      </div>
      {list.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      <ul className="space-y-2">
        {list.data?.map((idx) => (
          <li
            key={idx.name}
            className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
          >
            <div>
              <div className="font-medium">{idx.name}</div>
              <div className="font-mono text-xs text-[var(--color-muted)]">
                {JSON.stringify(idx.key)}
              </div>
            </div>
            {idx.name !== '_id_' && (
              <Button size="sm" variant="ghost" onClick={() => drop.mutate(idx.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SchemaPanel({ cid, db, col }: { cid: string; db: string; col: string }) {
  const schema = useQuery({
    queryKey: ['schema', cid, db, col],
    queryFn: async () => (await api.analyzeSchema(cid, db, col, 500)).data,
  });
  return (
    <div className="mx-auto max-w-3xl p-6">
      {schema.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {schema.data && (
        <>
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Sampled {schema.data.sampleSize} documents
          </p>
          <ul className="space-y-2">
            {schema.data.fields.map((f) => (
              <li
                key={f.path}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{f.path}</span>
                  <span className="font-mono text-xs text-[var(--color-muted)]">
                    {(f.presence * 100).toFixed(0)}% present
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.types.map((t) => (
                    <Badge key={t.type} className={TYPE_TONES[t.type] ?? ''}>
                      {t.type} ({t.count})
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AggregatePanel({ cid, db, col }: { cid: string; db: string; col: string }) {
  const [pipeline, setPipeline] = useState(() => {
    try {
      const pre = sessionStorage.getItem(`vast-agg:${cid}:${db}:${col}`);
      if (pre) {
        sessionStorage.removeItem(`vast-agg:${cid}:${db}:${col}`);
        return pre;
      }
    } catch {
      // ignore
    }
    return '[\n  { "$match": {} },\n  { "$limit": 20 }\n]';
  });
  const [result, setResult] = useState<unknown[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      const p = JSON.parse(pipeline) as unknown[];
      return api.aggregate(cid, db, col, p);
    },
    onSuccess: (res) => {
      setResult(res.data);
      setMs(res.executionMs);
      toast.success(`Returned ${res.returned} docs`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Pipeline</h3>
        <textarea
          className="min-h-[280px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
          spellCheck={false}
        />
        <Button className="mt-2" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Run aggregation
        </Button>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Results {ms != null && <span className="font-normal text-[var(--color-muted)]">({ms}ms)</span>}
        </h3>
        <pre className="min-h-[280px] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 font-mono text-[11px]">
          {result ? JSON.stringify(result, null, 2) : 'Run a pipeline to see results'}
        </pre>
      </div>
    </div>
  );
}

function ImportExportPanel({ cid, db, col }: { cid: string; db: string; col: string }) {
  const [content, setContent] = useState('{"hello":"world"}\n{"hello":"vast"}\n');
  const [format, setFormat] = useState<'jsonl' | 'json'>('jsonl');
  const [exported, setExported] = useState('');
  const qc = useQueryClient();

  const imp = useMutation({
    mutationFn: () => api.importData(cid, db, col, format, content),
    onSuccess: (res) => {
      toast.success(`Inserted ${res.data.insertedCount} documents`);
      void qc.invalidateQueries({ queryKey: ['docs', cid, db, col] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exp = useMutation({
    mutationFn: (fmt: 'json' | 'jsonl' | 'csv') => api.exportData(cid, db, col, fmt),
    onSuccess: (res) => {
      setExported(res.data.text);
      toast.success(`Exported ${res.data.count} documents`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4" /> Import
        </h3>
        <div className="mb-2 flex gap-2">
          <Button size="sm" variant={format === 'jsonl' ? 'primary' : 'secondary'} onClick={() => setFormat('jsonl')}>
            JSONL
          </Button>
          <Button size="sm" variant={format === 'json' ? 'primary' : 'secondary'} onClick={() => setFormat('json')}>
            JSON array
          </Button>
        </div>
        <textarea
          className="min-h-[200px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Button className="mt-2" onClick={() => imp.mutate()} disabled={imp.isPending}>
          Import
        </Button>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Download className="h-4 w-4" /> Export
        </h3>
        <div className="mb-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => exp.mutate('jsonl')}>
            JSONL
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exp.mutate('json')}>
            JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exp.mutate('csv')}>
            CSV
          </Button>
        </div>
        <textarea
          readOnly
          className="min-h-[200px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
          value={exported}
          placeholder="Export output appears here"
        />
      </div>
    </div>
  );
}
