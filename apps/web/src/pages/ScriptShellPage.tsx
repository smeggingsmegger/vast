import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Braces,
  ChevronRight,
  Loader2,
  Play,
  Table2,
  Terminal,
  AlignLeft,
} from 'lucide-react';
import { api, formatCell } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { listSavedScripts, upsertSavedScript } from '@/lib/saved-scripts';

type ResultView = 'json' | 'table' | 'raw';

const DEFAULT_SCRIPT = `// Multi-statement mongosh-style script (Vast shell)
// • Statements can use const/let, /regex/, ObjectId(), and chain .filter() etc.
// • Each statement's value shows on the right (JSON / table / raw).
// • Collection query box only accepts JSON filters — use this shell for real scripts.

// Example:
// const docs = db.my_collection.find({ name: /acme/i }).limit(20).toArray();
// docs
// db.other.find({ account_id: { $in: docs.map(d => d._id) } }).toArray()

db.getCollection("example").find({}).limit(5).toArray()
`;

export function ScriptShellPage() {
  const { cid = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const dbParam = searchParams.get('db') ?? '';

  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
  });
  const connection = connections.data?.find((c) => c.id === cid);

  const dbs = useQuery({
    queryKey: ['dbs', cid],
    queryFn: async () => (await api.listDatabases(cid)).data,
    enabled: !!cid && connection?.status === 'connected',
  });

  const [db, setDb] = useState(dbParam);
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [view, setView] = useState<ResultView>('json');
  const [activeResult, setActiveResult] = useState(0);

  // Sync db from URL
  useEffect(() => {
    if (dbParam) setDb(dbParam);
  }, [dbParam]);

  const run = useMutation({
    mutationFn: () => {
      if (!db) throw new Error('Select a database');
      return api.runScript(cid, db, { script, maxDocs: 2000 });
    },
    onSuccess: () => {
      setActiveResult(0);
      toast.success('Script finished');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const results = run.data?.data.results ?? [];
  const current = results[activeResult] ?? results[results.length - 1];

  const onDbChange = useCallback(
    (name: string) => {
      setDb(name);
      const next = new URLSearchParams(searchParams);
      if (name) next.set('db', name);
      else next.delete('db');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  function saveScript() {
    const name = window.prompt('Script name', `Shell ${db || 'script'}`);
    if (!name?.trim()) return;
    upsertSavedScript({
      name: name.trim(),
      script,
      cid,
      db: db || undefined,
    });
    toast.success('Script saved (this browser)');
  }

  const saved = listSavedScripts({ cid, db: db || undefined });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 md:px-6">
        <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-fg)]">
          <Link to="/" className="hover:text-[var(--color-foreground)]">
            Connections
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/c/${cid}`} className="hover:text-[var(--color-foreground)]">
            {connection?.name ?? 'Connection'}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--color-foreground)]">Shell</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Terminal className="h-5 w-5 text-[var(--color-accent)]" />
            Script shell
          </h1>
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            Database
            <select
              className="h-8 min-w-[160px] rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
              value={db}
              onChange={(e) => onDbChange(e.target.value)}
            >
              <option value="">Select…</option>
              {(dbs.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex-1" />
          {saved.length > 0 && (
            <select
              className="h-8 max-w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-xs"
              defaultValue=""
              onChange={(e) => {
                const s = saved.find((x) => x.id === e.target.value);
                if (s) {
                  setScript(s.script);
                  toast.message(`Loaded “${s.name}”`);
                }
                e.target.value = '';
              }}
            >
              <option value="">Load saved…</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="secondary" onClick={saveScript}>
            Save
          </Button>
          <Button
            size="sm"
            disabled={!db || run.isPending}
            onClick={() => run.mutate()}
            title="Run script (⌘/Ctrl+Enter)"
          >
            {run.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-muted-fg)]">
            mongosh-style multi-statement · <code className="text-[var(--color-accent)]">db</code>{' '}
            is this database · auto-awaits promises/cursors · ⌘/Ctrl+Enter to run
          </div>
          <textarea
            className="min-h-0 flex-1 resize-none bg-[var(--color-background)] p-3 font-mono text-xs leading-relaxed outline-none"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            spellCheck={false}
            aria-label="MongoDB shell script"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (db && !run.isPending) run.mutate();
              }
            }}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:max-w-[55%]">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <span className="text-xs font-medium text-[var(--color-muted)]">Results</span>
            {run.data && (
              <Badge tone="accent">{run.data.data.executionMs}ms</Badge>
            )}
            <div className="flex-1" />
            <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
              {(
                [
                  ['json', Braces, 'JSON'],
                  ['table', Table2, 'Table'],
                  ['raw', AlignLeft, 'Raw'],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
                    view === id
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
                  )}
                  onClick={() => setView(id)}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {results.length > 1 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-border)] px-2 py-1.5">
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 font-mono text-[10px]',
                    i === activeResult
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-card-hover)]',
                    r.error && 'text-red-400',
                  )}
                  onClick={() => setActiveResult(i)}
                  title={r.statement}
                >
                  [{r.index}] {r.error ? 'error' : summarizeLabel(r.value)}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3">
            {!run.data && !run.isError && (
              <p className="text-sm text-[var(--color-muted)]">
                Select a database and run a script. Each statement’s value appears here as JSON,
                a table (for arrays of objects), or raw text.
              </p>
            )}
            {run.isError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {(run.error as Error).message}
              </div>
            )}
            {current?.error && (
              <div className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <div className="mb-1 font-mono text-[11px] text-red-200/80">{current.statement}</div>
                {current.error}
              </div>
            )}
            {current && current.hasValue && !current.error && (
              <>
                <div className="mb-2 font-mono text-[10px] text-[var(--color-muted-fg)]">
                  {current.statement}
                </div>
                <ResultBody view={view} value={current.value} />
              </>
            )}
            {run.data && results.length === 0 && (
              <p className="text-sm text-[var(--color-muted)]">
                Script completed with no result values (only side effects).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function summarizeLabel(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value && typeof value === 'object') {
    if ('__vastTruncated' in (value as object)) {
      const t = value as { returned?: number };
      return `array(~${t.returned ?? '?'})`;
    }
    return 'object';
  }
  return typeof value;
}

function ResultBody({ view, value }: { view: ResultView; value: unknown }) {
  const table = useMemo(() => asTable(value), [value]);

  if (view === 'table' && table) {
    return (
      <div className="overflow-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-max min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[var(--color-sidebar)]">
            <tr>
              {table.columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-[var(--color-border)] px-2 py-1.5 font-medium text-[var(--color-muted)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-card-hover)]">
                {table.columns.map((c) => (
                  <td key={c} className="max-w-[280px] truncate px-2 py-1 font-mono" title={formatCell(row[c])}>
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.truncated && (
          <p className="border-t border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-muted-fg)]">
            Showing first {table.rows.length} rows
          </p>
        )}
      </div>
    );
  }

  if (view === 'raw') {
    return (
      <pre className="whitespace-pre-wrap break-words rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 font-mono text-[11px] leading-relaxed">
        {rawString(value)}
      </pre>
    );
  }

  // JSON (default)
  return (
    <pre className="overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(unwrapTruncated(value), null, 2)}
    </pre>
  );
}

function unwrapTruncated(value: unknown): unknown {
  if (value && typeof value === 'object' && '__vastTruncated' in (value as object)) {
    const t = value as { data?: unknown; returned?: number };
    return t.data ?? value;
  }
  return value;
}

function rawString(value: unknown): string {
  const v = unwrapTruncated(value);
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function asTable(
  value: unknown,
): { columns: string[]; rows: Record<string, unknown>[]; truncated?: boolean } | null {
  let rows: unknown = unwrapTruncated(value);
  let truncated = false;
  if (value && typeof value === 'object' && '__vastTruncated' in (value as object)) {
    truncated = true;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (!rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return null;
  const cols = new Set<string>();
  for (const r of rows as Record<string, unknown>[]) {
    Object.keys(r).forEach((k) => cols.add(k));
  }
  // Prefer _id first
  const columns = [...cols].sort((a, b) => {
    if (a === '_id') return -1;
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });
  return {
    columns,
    rows: rows as Record<string, unknown>[],
    truncated,
  };
}
