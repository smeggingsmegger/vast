import { AlertTriangle, CheckCircle2, Eye, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCell } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { QueryKind } from '@/lib/query-script';

export type QueryResultKind =
  | 'preview'
  | 'find'
  | 'count'
  | 'write'
  | 'error'
  | 'info';

export interface QueryResultSummary {
  kind: QueryResultKind;
  op: QueryKind | string;
  /** Primary headline, e.g. "Would match 42 documents" */
  title: string;
  /** Secondary detail lines */
  details?: string[];
  /** Numeric stats for chips */
  stats?: { label: string; value: string | number; tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent' }[];
  matchCount?: number;
  sample?: Record<string, unknown>[];
  executionMs?: number;
  isDryRun?: boolean;
}

export function QueryResultPanel({
  result,
  className,
}: {
  result: QueryResultSummary | null;
  className?: string;
}) {
  if (!result) return null;

  const icon =
    result.kind === 'error' ? (
      <AlertTriangle className="h-4 w-4 text-red-400" />
    ) : result.kind === 'write' && !result.isDryRun ? (
      <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
    ) : result.isDryRun || result.kind === 'preview' ? (
      <Eye className="h-4 w-4 text-[var(--color-accent)]" />
    ) : (
      <Info className="h-4 w-4 text-[var(--color-muted)]" />
    );

  const border =
    result.kind === 'error'
      ? 'border-red-500/40 bg-red-500/10'
      : result.kind === 'write' && !result.isDryRun
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : result.isDryRun || result.kind === 'preview'
          ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]'
          : 'border-[var(--color-border)] bg-[var(--color-card)]';

  return (
    <div className={cn('rounded-lg border px-3 py-2 text-xs', border, className)}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.isDryRun ? 'accent' : result.kind === 'write' ? 'success' : 'default'}>
              {result.isDryRun ? 'preview' : result.op}
            </Badge>
            <span className="font-medium text-[var(--color-foreground)]">{result.title}</span>
            {result.executionMs != null && (
              <span className="text-[var(--color-muted-fg)]">{result.executionMs}ms</span>
            )}
          </div>
          {result.details && result.details.length > 0 && (
            <ul className="list-inside list-disc text-[var(--color-muted)]">
              {result.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {result.stats && result.stats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {result.stats.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/60 px-2 py-0.5 font-mono text-[11px]"
                >
                  <span className="text-[var(--color-muted-fg)]">{s.label}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      s.tone === 'success' && 'text-emerald-400',
                      s.tone === 'danger' && 'text-red-400',
                      s.tone === 'warning' && 'text-amber-400',
                      s.tone === 'accent' && 'text-[var(--color-accent)]',
                    )}
                  >
                    {s.value}
                  </span>
                </span>
              ))}
            </div>
          )}
          {result.sample && result.sample.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <p className="text-[10px] font-medium tracking-wide text-[var(--color-muted-fg)] uppercase">
                Sample ({result.sample.length}
                {result.matchCount != null && result.matchCount > result.sample.length
                  ? ` of ${result.matchCount}`
                  : ''}
                )
              </p>
              <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)]/50 p-1.5 font-mono text-[10px]">
                {result.sample.map((doc, i) => (
                  <div
                    key={i}
                    className="truncate rounded px-1.5 py-0.5 hover:bg-[var(--color-card-hover)]"
                    title={safeJson(doc)}
                  >
                    <span className="text-[var(--color-muted-fg)]">{i + 1}.</span>{' '}
                    {summarizeDoc(doc)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeJson(doc: unknown): string {
  try {
    return JSON.stringify(doc);
  } catch {
    return String(doc);
  }
}

function summarizeDoc(doc: Record<string, unknown>): string {
  const id = doc._id !== undefined ? formatCell(doc._id) : '—';
  const keys = Object.keys(doc).filter((k) => k !== '_id').slice(0, 4);
  const bits = keys.map((k) => `${k}=${truncate(formatCell(doc[k]), 24)}`);
  return `_id=${truncate(id, 28)}${bits.length ? ' · ' + bits.join(' · ') : ''}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
