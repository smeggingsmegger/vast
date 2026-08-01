import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Braces,
  ListTree,
  Filter,
} from 'lucide-react';
import { api, bsonTypeOf, formatCell, idToPath } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
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

export function DocumentsPage() {
  const { cid = '', db: dbParam = '', col: colParam = '' } = useParams();
  const db = decodeURIComponent(dbParam);
  const col = decodeURIComponent(colParam);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'documents';
  const setTab = (t: Tab) => setSearchParams({ tab: t });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--color-border)] px-4 py-3 md:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-fg)]">
          <Link to="/" className="hover:text-[var(--color-foreground)]">
            Connections
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/c/${cid}`} className="hover:text-[var(--color-foreground)]">
            Connection
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            to={`/c/${cid}/db/${encodeURIComponent(db)}`}
            className="hover:text-[var(--color-foreground)]"
          >
            {db}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--color-foreground)]">{col}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{col}</h1>
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
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'documents' && <DocumentsPanel cid={cid} db={db} col={col} />}
        {tab === 'indexes' && <IndexesPanel cid={cid} db={db} col={col} />}
        {tab === 'schema' && <SchemaPanel cid={cid} db={db} col={col} />}
        {tab === 'aggregate' && <AggregatePanel cid={cid} db={db} col={col} />}
        {tab === 'import' && <ImportExportPanel cid={cid} db={db} col={col} />}
      </div>
    </div>
  );
}

function DocumentsPanel({ cid, db, col }: { cid: string; db: string; col: string }) {
  const qc = useQueryClient();
  const [filterText, setFilterText] = useState('{}');
  const [appliedFilter, setAppliedFilter] = useState<unknown>({});
  const [skip, setSkip] = useState(0);
  const limit = 50;
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [editMode, setEditMode] = useState<'tree' | 'json'>('json');
  const [jsonText, setJsonText] = useState('');
  const [showInsert, setShowInsert] = useState(false);
  const [insertText, setInsertText] = useState('{\n  \n}');
  const [convertPath, setConvertPath] = useState<string | null>(null);
  const [convertType, setConvertType] = useState('string');
  const [fieldFilter, setFieldFilter] = useState({ field: '', op: 'eq', value: '' });

  const docs = useQuery({
    queryKey: ['docs', cid, db, col, appliedFilter, skip, limit],
    queryFn: () => api.find(cid, db, col, { filter: appliedFilter, skip, limit }),
  });

  const columns = useMemo(() => {
    const keys = new Set<string>(['_id']);
    for (const d of docs.data?.data ?? []) {
      Object.keys(d).forEach((k) => keys.add(k));
      if (keys.size > 12) break;
    }
    return [...keys].slice(0, 12);
  }, [docs.data]);

  function applyFilter() {
    try {
      const parsed = JSON.parse(filterText || '{}');
      setAppliedFilter(parsed);
      setSkip(0);
    } catch {
      toast.error('Invalid filter JSON');
    }
  }

  function applyFieldFilter() {
    if (!fieldFilter.field) return;
    let value: unknown = fieldFilter.value;
    if (fieldFilter.value === 'true') value = true;
    else if (fieldFilter.value === 'false') value = false;
    else if (fieldFilter.value === 'null') value = null;
    else if (/^-?\d+(\.\d+)?$/.test(fieldFilter.value)) value = Number(fieldFilter.value);
    const filter =
      fieldFilter.op === 'eq'
        ? { [fieldFilter.field]: value }
        : { [fieldFilter.field]: { [`$${fieldFilter.op}`]: value } };
    setFilterText(JSON.stringify(filter, null, 2));
    setAppliedFilter(filter);
    setSkip(0);
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

  function openDoc(doc: Record<string, unknown>) {
    setSelected(doc);
    setJsonText(JSON.stringify(doc, null, 2));
    setEditMode('json');
  }

  return (
    <div className="flex h-full min-h-[480px] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col border-r border-[var(--color-border)]">
        <div className="space-y-2 border-b border-[var(--color-border)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--color-muted)]" />
            <Input
              className="max-w-[120px]"
              placeholder="field"
              value={fieldFilter.field}
              onChange={(e) => setFieldFilter((f) => ({ ...f, field: e.target.value }))}
            />
            <select
              className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-sm"
              value={fieldFilter.op}
              onChange={(e) => setFieldFilter((f) => ({ ...f, op: e.target.value }))}
            >
              <option value="eq">equals</option>
              <option value="ne">≠</option>
              <option value="gt">&gt;</option>
              <option value="gte">≥</option>
              <option value="lt">&lt;</option>
              <option value="lte">≤</option>
              <option value="regex">regex</option>
            </select>
            <Input
              className="max-w-[140px]"
              placeholder="value"
              value={fieldFilter.value}
              onChange={(e) => setFieldFilter((f) => ({ ...f, value: e.target.value }))}
            />
            <Button size="sm" variant="secondary" onClick={applyFieldFilter}>
              Apply
            </Button>
          </div>
          <div className="flex gap-2">
            <textarea
              className="min-h-[56px] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-2 font-mono text-xs"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              spellCheck={false}
              aria-label="JSON filter"
            />
            <div className="flex flex-col gap-1">
              <Button size="sm" onClick={applyFilter}>
                Run
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void docs.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setShowInsert(true)}>
              <Plus className="h-3.5 w-3.5" />
              Insert
            </Button>
            {docs.data && (
              <span className="font-mono text-[11px] text-[var(--color-muted-fg)]">
                {docs.data.page.returned} rows · {docs.data.page.executionMs}ms
                {docs.data.page.hasMore ? ' · more…' : ''}
              </span>
            )}
            <div className="flex-1" />
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

        <div className="min-h-0 flex-1 overflow-auto">
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
            </div>
          )}
          {docs.data && docs.data.data.length > 0 && (
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[var(--color-sidebar)]">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="border-b border-[var(--color-border)] px-3 py-2 font-medium text-[var(--color-muted)]"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.data.data.map((doc, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-card-hover)]',
                      selected && idToPath(selected._id) === idToPath(doc._id) && 'bg-[var(--color-accent-soft)]',
                    )}
                    onClick={() => openDoc(doc)}
                  >
                    {columns.map((c) => (
                      <td key={c} className="max-w-[220px] truncate px-3 py-2 font-mono">
                        <span className="mr-1">
                          <span
                            className={cn(
                              'inline-block rounded px-1 text-[10px]',
                              TYPE_TONES[bsonTypeOf(doc[c])] ?? TYPE_TONES.object,
                            )}
                          >
                            {bsonTypeOf(doc[c]).slice(0, 3)}
                          </span>
                        </span>
                        {formatCell(doc[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside className="flex w-full flex-col border-t border-[var(--color-border)] lg:w-[420px] lg:border-l lg:border-t-0">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-[var(--color-muted)]">
            <Braces className="mb-3 h-8 w-8 opacity-40" />
            Select a document to inspect and edit
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-2">
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
                className="min-h-[320px] flex-1 resize-none bg-[var(--color-background)] p-3 font-mono text-xs leading-relaxed outline-none"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                aria-label="Document JSON"
              />
            ) : (
              <div className="flex-1 overflow-auto p-3">
                <FieldTree
                  doc={selected}
                  onConvert={(path) => {
                    setConvertPath(path);
                    setConvertType('string');
                  }}
                />
              </div>
            )}
          </>
        )}
      </aside>

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
}: {
  doc: unknown;
  path?: string;
  onConvert: (path: string) => void;
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
            ('$oid' in v || '$date' in v || '$numberLong' in v || '$numberDecimal' in v));
        return (
          <li key={p} className="rounded-lg border border-[var(--color-border)]/60 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-[var(--color-accent)]">{k}</span>
              <Badge className={TYPE_TONES[bsonTypeOf(v)]}>{bsonTypeOf(v)}</Badge>
              {isLeaf && (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-muted)]">
                    {formatCell(v)}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => onConvert(p)}>
                    type
                  </Button>
                </>
              )}
            </div>
            {!isLeaf && (
              <div className="ml-3 mt-1 border-l border-[var(--color-border)] pl-2">
                <FieldTree doc={v} path={p} onConvert={onConvert} />
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
  const [pipeline, setPipeline] = useState(
    '[\n  { "$match": {} },\n  { "$limit": 20 }\n]',
  );
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
