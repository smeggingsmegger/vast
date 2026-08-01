import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Cable,
  Database,
  FolderOpen,
  Loader2,
  PlugZap,
  RefreshCw,
  Settings,
  Table2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useTabsStore } from '@/stores/tabs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ExplorerSidebar() {
  const location = useLocation();
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
  });

  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = connections.data ?? [];
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [connections.data, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-[var(--color-border)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Explorer
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5"
            title="Refresh connections"
            onClick={() => void connections.refetch()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', connections.isFetching && 'animate-spin')} />
          </Button>
        </div>
        <input
          className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-xs outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          placeholder="Filter connections…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {connections.isLoading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--color-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        {connections.isError && (
          <p className="px-2 py-2 text-xs text-red-300">Could not load connections</p>
        )}
        {filtered.map((conn) => (
          <ConnectionNode
            key={conn.id}
            id={conn.id}
            name={conn.name}
            status={conn.status}
            activePath={location.pathname}
          />
        ))}
        {connections.data && connections.data.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--color-muted)]">
            No connections yet.{' '}
            <Link to="/" className="text-[var(--color-accent)] hover:underline">
              Add one
            </Link>
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-[var(--color-border)] p-2">
        <SideLink to="/" active={location.pathname === '/'}>
          <Cable className="h-3.5 w-3.5" />
          Manage connections
        </SideLink>
        <SideLink to="/settings" active={location.pathname === '/settings'}>
          <Settings className="h-3.5 w-3.5" />
          Settings
        </SideLink>
      </div>
    </div>
  );
}

function SideLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-foreground)]',
      )}
    >
      {children}
    </Link>
  );
}

function ConnectionNode({
  id,
  name,
  status,
  activePath,
}: {
  id: string;
  name: string;
  status: string;
  activePath: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openTab = useTabsStore((s) => s.openTab);
  const [open, setOpen] = useState(() => activePath.startsWith(`/c/${id}`));
  const isConnected = status === 'connected';
  const isActiveConn = activePath === `/c/${id}` || activePath.startsWith(`/c/${id}/`);

  const connect = useMutation({
    mutationFn: () => api.connect(id),
    onSuccess: () => {
      toast.success(`Connected: ${name}`);
      void qc.invalidateQueries({ queryKey: ['connections'] });
      void qc.invalidateQueries({ queryKey: ['dbs', id] });
      setOpen(true);
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : e.message),
  });

  const dbs = useQuery({
    queryKey: ['dbs', id],
    queryFn: async () => (await api.listDatabases(id)).data,
    enabled: open && isConnected,
  });

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded-md pr-1',
          isActiveConn && 'bg-[var(--color-card-hover)]',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-xs hover:bg-[var(--color-card-hover)]"
          onClick={() => {
            if (!isConnected) {
              connect.mutate();
              return;
            }
            setOpen((v) => !v);
          }}
          onDoubleClick={() => navigate(`/c/${id}`)}
          title={isConnected ? 'Click to expand · double-click to open' : 'Click to connect'}
        >
          {open && isConnected ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
          )}
          <Cable
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              isConnected ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]',
            )}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        </button>
        {!isConnected && (
          <button
            type="button"
            className="rounded p-1 text-[var(--color-muted)] opacity-0 hover:bg-[var(--color-input)] hover:text-[var(--color-accent)] group-hover:opacity-100"
            title="Connect"
            onClick={() => connect.mutate()}
          >
            {connect.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PlugZap className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {open && isConnected && (
        <div className="ml-3 border-l border-[var(--color-border)] pl-1">
          {dbs.isLoading && (
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--color-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Databases…
            </div>
          )}
          {dbs.isError && (
            <p className="px-2 py-1 text-[11px] text-red-300">Failed to list databases</p>
          )}
          {(dbs.data ?? []).map((db) => (
            <DatabaseNode
              key={db.name}
              cid={id}
              connectionName={name}
              db={db.name}
              activePath={activePath}
              openTab={openTab}
            />
          ))}
          {dbs.data && dbs.data.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-[var(--color-muted)]">No databases</p>
          )}
        </div>
      )}
    </div>
  );
}

function DatabaseNode({
  cid,
  connectionName,
  db,
  activePath,
  openTab,
}: {
  cid: string;
  connectionName: string;
  db: string;
  activePath: string;
  openTab: ReturnType<typeof useTabsStore.getState>['openTab'];
}) {
  const navigate = useNavigate();
  const base = `/c/${cid}/db/${encodeURIComponent(db)}`;
  const isActive = activePath === base || activePath.startsWith(`${base}/`);
  const [open, setOpen] = useState(() => isActive);

  const cols = useQuery({
    queryKey: ['cols', cid, db],
    queryFn: async () => (await api.listCollections(cid, db)).data,
    enabled: open,
  });

  return (
    <div className="mb-0.5">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs hover:bg-[var(--color-card-hover)]',
          isActive && 'bg-[var(--color-card-hover)]',
        )}
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => navigate(base)}
        title="Click to expand · double-click to open database"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
        )}
        <Database className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
        <span className="min-w-0 flex-1 truncate">{db}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-[var(--color-border)] pl-1">
          {cols.isLoading && (
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--color-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Collections…
            </div>
          )}
          {(cols.data ?? []).map((col) => {
            const path = `${base}/col/${encodeURIComponent(col.name)}`;
            const active = activePath === path;
            return (
              <button
                key={col.name}
                type="button"
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs hover:bg-[var(--color-card-hover)]',
                  active &&
                    'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]',
                )}
                onClick={() => {
                  openTab({
                    cid,
                    db,
                    col: col.name,
                    connectionName,
                  });
                  navigate(path);
                }}
                title={col.name}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{col.name}</span>
                {typeof col.estimatedCount === 'number' && (
                  <span className="shrink-0 text-[10px] text-[var(--color-muted-fg)]">
                    {col.estimatedCount}
                  </span>
                )}
              </button>
            );
          })}
          {cols.data && cols.data.length === 0 && (
            <p className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--color-muted)]">
              <FolderOpen className="h-3 w-3" /> Empty
            </p>
          )}
        </div>
      )}
    </div>
  );
}
