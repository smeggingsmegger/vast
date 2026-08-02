import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Database, PanelLeft, Table2 } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Database overview — collections live in the explorer sidebar.
 * Create / dump / drop are available via right-click on the tree.
 */
export function DatabasePage() {
  const { cid = '', db: dbParam = '' } = useParams();
  const db = decodeURIComponent(dbParam);

  const cols = useQuery({
    queryKey: ['cols', cid, db],
    queryFn: async () => (await api.listCollections(cid, db)).data,
    enabled: !!cid && !!db,
  });

  const count = cols.data?.length ?? 0;

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1 text-xs text-[var(--color-muted-fg)]">
          <Link to="/" className="hover:text-[var(--color-foreground)]">
            Connections
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/c/${cid}`} className="hover:text-[var(--color-foreground)]">
            Connection
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--color-foreground)]">{db}</span>
        </div>

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)]">
          <Database className="h-7 w-7 text-[var(--color-accent)]" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{db}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {cols.isLoading
            ? 'Loading collections…'
            : count === 0
              ? 'No collections yet.'
              : `${count} collection${count === 1 ? '' : 's'} in the explorer.`}
        </p>

        <div className="mt-8 w-full max-w-md space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left text-sm text-[var(--color-muted)]">
          <p className="flex items-start gap-2">
            <PanelLeft className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span>
              Browse collections in the <strong className="text-[var(--color-foreground)]">left explorer</strong>.
              Click a collection to open it as a tab.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Table2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span>
              <strong className="text-[var(--color-foreground)]">Right-click</strong> a database or
              collection for New collection, Dump, Drop, and more.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
