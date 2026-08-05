import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Cable,
  Database,
  Download,
  FolderOpen,
  Loader2,
  Plus,
  PlugZap,
  RefreshCw,
  Settings,
  Table2,
  Terminal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useTabsStore } from '@/stores/tabs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

type CtxMenu =
  | { kind: 'conn'; x: number; y: number; cid: string; name: string }
  | { kind: 'db'; x: number; y: number; cid: string; db: string }
  | { kind: 'col'; x: number; y: number; cid: string; db: string; col: string };

export function ExplorerSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openTab = useTabsStore((s) => s.openTab);
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
  });

  const [filter, setFilter] = useState('');
  /** Search query shared across connections / databases / collections */
  const q = filter.trim().toLowerCase();
  const [menu, setMenu] = useState<CtxMenu | null>(null);

  // Dialogs driven from context menu
  const [newCol, setNewCol] = useState<{ cid: string; db: string } | null>(null);
  const [newColName, setNewColName] = useState('');
  const [dropCol, setDropCol] = useState<{ cid: string; db: string; col: string } | null>(null);
  const [dropColConfirm, setDropColConfirm] = useState('');
  const [dropDb, setDropDb] = useState<{ cid: string; db: string } | null>(null);
  const [dropDbConfirm, setDropDbConfirm] = useState('');

  // Sort connections A–Z; filtering of nested db/col happens per-node (needs live lists).
  const sortedConnections = useMemo(() => {
    const list = [...(connections.data ?? [])];
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return list;
  }, [connections.data]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const createCol = useMutation({
    mutationFn: () => {
      if (!newCol) throw new Error('missing target');
      return api.createCollection(newCol.cid, newCol.db, newColName.trim());
    },
    onSuccess: () => {
      toast.success(`Collection “${newColName.trim()}” created`);
      if (newCol) void qc.invalidateQueries({ queryKey: ['cols', newCol.cid, newCol.db] });
      setNewCol(null);
      setNewColName('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dropCollection = useMutation({
    mutationFn: () => {
      if (!dropCol) throw new Error('missing target');
      return api.dropCollection(dropCol.cid, dropCol.db, dropCol.col);
    },
    onSuccess: () => {
      toast.success('Collection dropped');
      if (dropCol) void qc.invalidateQueries({ queryKey: ['cols', dropCol.cid, dropCol.db] });
      setDropCol(null);
      setDropColConfirm('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dropDatabase = useMutation({
    mutationFn: () => {
      if (!dropDb) throw new Error('missing target');
      return api.dropDatabase(dropDb.cid, dropDb.db);
    },
    onSuccess: () => {
      toast.success('Database dropped');
      if (dropDb) void qc.invalidateQueries({ queryKey: ['dbs', dropDb.cid] });
      setDropDb(null);
      setDropDbConfirm('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dumpDb = useMutation({
    mutationFn: ({ cid, db }: { cid: string; db: string }) => api.dump(cid, db),
    onSuccess: (res) => {
      toast.success(
        `Dump complete: ${res.data.collections.map((c) => `${c.name}(${c.count})`).join(', ')}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
          placeholder="Search connections, DBs, collections…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search explorer"
        />
        {q && (
          <p className="text-[10px] text-[var(--color-muted-fg)]">
            Filtering by “{filter.trim()}” · expands matches
          </p>
        )}
      </div>

      <div className="h-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2">
        {connections.isLoading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--color-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        {connections.isError && (
          <p className="px-2 py-2 text-xs text-red-300">Could not load connections</p>
        )}
        {sortedConnections.map((conn) => (
          <ConnectionNode
            key={conn.id}
            id={conn.id}
            name={conn.name}
            status={conn.status}
            activePath={location.pathname}
            search={q}
            onConnContextMenu={(e, cid, name) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ kind: 'conn', x: e.clientX, y: e.clientY, cid, name });
            }}
            onDbContextMenu={(e, cid, db) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ kind: 'db', x: e.clientX, y: e.clientY, cid, db });
            }}
            onColContextMenu={(e, cid, db, col) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ kind: 'col', x: e.clientX, y: e.clientY, cid, db, col });
            }}
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

      {menu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close menu"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            role="menu"
            className="fixed z-50 min-w-[200px] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, window.innerWidth - 220),
              top: Math.min(menu.y, window.innerHeight - 220),
            }}
          >
            {menu.kind === 'conn' && (
              <>
                <MenuHeader>{menu.name}</MenuHeader>
                <MenuItem
                  icon={<Terminal className="h-3.5 w-3.5" />}
                  onClick={() => {
                    navigate(`/c/${menu.cid}/shell`);
                    setMenu(null);
                  }}
                >
                  Script shell…
                </MenuItem>
              </>
            )}
            {menu.kind === 'db' && (
              <>
                <MenuHeader>{menu.db}</MenuHeader>
                <MenuItem
                  icon={<Terminal className="h-3.5 w-3.5" />}
                  onClick={() => {
                    navigate(
                      `/c/${menu.cid}/shell?db=${encodeURIComponent(menu.db)}`,
                    );
                    setMenu(null);
                  }}
                >
                  Script shell…
                </MenuItem>
                <MenuItem
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setNewCol({ cid: menu.cid, db: menu.db });
                    setNewColName('');
                    setMenu(null);
                  }}
                >
                  New collection…
                </MenuItem>
                <MenuItem
                  icon={<Download className="h-3.5 w-3.5" />}
                  disabled={dumpDb.isPending}
                  onClick={() => {
                    dumpDb.mutate({ cid: menu.cid, db: menu.db });
                    setMenu(null);
                  }}
                >
                  Dump database
                </MenuItem>
                <MenuItem
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => {
                    void qc.invalidateQueries({ queryKey: ['cols', menu.cid, menu.db] });
                    void qc.invalidateQueries({ queryKey: ['dbs', menu.cid] });
                    toast.message('Refreshed');
                    setMenu(null);
                  }}
                >
                  Refresh
                </MenuItem>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  danger
                  onClick={() => {
                    setDropDb({ cid: menu.cid, db: menu.db });
                    setDropDbConfirm('');
                    setMenu(null);
                  }}
                >
                  Drop database…
                </MenuItem>
              </>
            )}
            {menu.kind === 'col' && (
              <>
                <MenuHeader className="font-mono">{menu.col}</MenuHeader>
                <MenuItem
                  icon={<Table2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    const path = `/c/${menu.cid}/db/${encodeURIComponent(menu.db)}/col/${encodeURIComponent(menu.col)}`;
                    openTab({
                      cid: menu.cid,
                      db: menu.db,
                      col: menu.col,
                    });
                    navigate(path);
                    setMenu(null);
                  }}
                >
                  Open
                </MenuItem>
                <MenuItem
                  icon={<Cable className="h-3.5 w-3.5" />}
                  onClick={() => {
                    void navigator.clipboard.writeText(menu.col);
                    toast.success('Collection name copied');
                    setMenu(null);
                  }}
                >
                  Copy name
                </MenuItem>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  danger
                  onClick={() => {
                    setDropCol({ cid: menu.cid, db: menu.db, col: menu.col });
                    setDropColConfirm('');
                    setMenu(null);
                  }}
                >
                  Drop collection…
                </MenuItem>
              </>
            )}
          </div>
        </>
      )}

      <Dialog
        open={!!newCol}
        onClose={() => {
          setNewCol(null);
          setNewColName('');
        }}
        title="Create collection"
      >
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          In database <span className="font-mono text-[var(--color-foreground)]">{newCol?.db}</span>
        </p>
        <Input
          value={newColName}
          onChange={(e) => setNewColName(e.target.value)}
          placeholder="users"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newColName.trim()) createCol.mutate();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNewCol(null)}>
            Cancel
          </Button>
          <Button
            disabled={!newColName.trim() || createCol.isPending}
            onClick={() => createCol.mutate()}
          >
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!dropCol}
        onClose={() => {
          setDropCol(null);
          setDropColConfirm('');
        }}
        title="Drop collection"
      >
        <p className="text-sm text-[var(--color-muted)]">
          Type <strong className="font-mono text-[var(--color-foreground)]">{dropCol?.col}</strong> to
          confirm.
        </p>
        <Input
          className="mt-3"
          value={dropColConfirm}
          onChange={(e) => setDropColConfirm(e.target.value)}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDropCol(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={dropColConfirm !== dropCol?.col || dropCollection.isPending}
            onClick={() => dropCollection.mutate()}
          >
            Drop collection
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!dropDb}
        onClose={() => {
          setDropDb(null);
          setDropDbConfirm('');
        }}
        title="Drop database"
      >
        <p className="text-sm text-[var(--color-muted)]">
          Type <strong className="font-mono text-[var(--color-foreground)]">{dropDb?.db}</strong> to
          confirm. This cannot be undone.
        </p>
        <Input
          className="mt-3"
          value={dropDbConfirm}
          onChange={(e) => setDropDbConfirm(e.target.value)}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDropDb(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={dropDbConfirm !== dropDb?.db || dropDatabase.isPending}
            onClick={() => dropDatabase.mutate()}
          >
            Drop database
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function MenuHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-b border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-muted-fg)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs disabled:opacity-40',
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'hover:bg-[var(--color-card-hover)]',
      )}
      onClick={onClick}
    >
      <span className="text-[var(--color-muted)]">{icon}</span>
      {children}
    </button>
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

function nameMatches(name: string, search: string): boolean {
  if (!search) return true;
  return name.toLowerCase().includes(search);
}

function ConnectionNode({
  id,
  name,
  status,
  activePath,
  search,
  onConnContextMenu,
  onDbContextMenu,
  onColContextMenu,
}: {
  id: string;
  name: string;
  status: string;
  activePath: string;
  search: string;
  onConnContextMenu: (e: ReactMouseEvent, cid: string, name: string) => void;
  onDbContextMenu: (e: ReactMouseEvent, cid: string, db: string) => void;
  onColContextMenu: (e: ReactMouseEvent, cid: string, db: string, col: string) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openTab = useTabsStore((s) => s.openTab);
  const connMatches = nameMatches(name, search);
  const [open, setOpen] = useState(() => activePath.startsWith(`/c/${id}`) || !!search);
  const isConnected = status === 'connected';
  const isActiveConn = activePath === `/c/${id}` || activePath.startsWith(`/c/${id}/`);

  // Auto-expand while searching so nested hits are visible
  useEffect(() => {
    if (search && isConnected) setOpen(true);
  }, [search, isConnected]);

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

  // Fetch DBs when expanded, or when searching (so we can match db/col names)
  const dbs = useQuery({
    queryKey: ['dbs', id],
    queryFn: async () => (await api.listDatabases(id)).data,
    enabled: isConnected && (open || !!search),
  });

  const sortedDbs = useMemo(() => {
    const list = [...(dbs.data ?? [])];
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return list;
  }, [dbs.data]);

  // Hide connection when search doesn't match name and no nested data yet that might match
  // (DatabaseNode returns null if no match — we still show parent if name matches or while loading)
  if (search && !connMatches && !isConnected) {
    return null;
  }

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
          onContextMenu={(e) => onConnContextMenu(e, id, name)}
          title={
            isConnected
              ? 'Click to expand · right-click for shell · double-click to open'
              : 'Click to connect'
          }
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
          {sortedDbs.map((db) => (
            <DatabaseNode
              key={db.name}
              cid={id}
              connectionName={name}
              db={db.name}
              activePath={activePath}
              search={search}
              forceShow={connMatches}
              openTab={openTab}
              onDbContextMenu={onDbContextMenu}
              onColContextMenu={onColContextMenu}
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
  search,
  forceShow,
  openTab,
  onDbContextMenu,
  onColContextMenu,
}: {
  cid: string;
  connectionName: string;
  db: string;
  activePath: string;
  search: string;
  /** Parent connection name matched search — show all children */
  forceShow: boolean;
  openTab: ReturnType<typeof useTabsStore.getState>['openTab'];
  onDbContextMenu: (e: ReactMouseEvent, cid: string, db: string) => void;
  onColContextMenu: (e: ReactMouseEvent, cid: string, db: string, col: string) => void;
}) {
  const navigate = useNavigate();
  const base = `/c/${cid}/db/${encodeURIComponent(db)}`;
  const isActive = activePath === base || activePath.startsWith(`${base}/`);
  const dbMatches = nameMatches(db, search);
  const [open, setOpen] = useState(() => isActive || (!!search && dbMatches));

  // Keep expanded when navigating into this DB or when searching
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);
  useEffect(() => {
    if (search) setOpen(true);
  }, [search]);

  const cols = useQuery({
    queryKey: ['cols', cid, db],
    queryFn: async () => (await api.listCollections(cid, db)).data,
    enabled: open || !!search,
  });

  const sortedCols = useMemo(() => {
    const list = [...(cols.data ?? [])];
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return list;
  }, [cols.data]);

  const visibleCols = useMemo(() => {
    if (!search || forceShow || dbMatches) return sortedCols;
    return sortedCols.filter((c) => nameMatches(c.name, search));
  }, [sortedCols, search, forceShow, dbMatches]);

  // Hide this DB entirely if search doesn't match db name or any collection
  if (search && !forceShow && !dbMatches) {
    if (cols.isLoading || cols.isFetching) {
      // still loading — show briefly so search can resolve
    } else if (visibleCols.length === 0) {
      return null;
    }
  }

  return (
    <div className="mb-0.5">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs hover:bg-[var(--color-card-hover)]',
          isActive && !activePath.includes('/col/') && 'bg-[var(--color-card-hover)]',
        )}
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => navigate(base)}
        onContextMenu={(e) => onDbContextMenu(e, cid, db)}
        title="Click to expand · right-click for actions · double-click to open"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-fg)]" />
        )}
        <Database className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
        <span className="min-w-0 flex-1 truncate">{db}</span>
        {cols.data && (
          <span className="shrink-0 text-[10px] text-[var(--color-muted-fg)]">
            {search && !forceShow && !dbMatches ? visibleCols.length : cols.data.length}
          </span>
        )}
      </button>
      {open && (
        <div className="ml-3 border-l border-[var(--color-border)] pl-1">
          {cols.isLoading && (
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--color-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Collections…
            </div>
          )}
          {visibleCols.map((col) => {
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
                onContextMenu={(e) => onColContextMenu(e, cid, db, col.name)}
                title={`${col.name} · right-click for actions`}
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
              <FolderOpen className="h-3 w-3" /> Empty · right-click DB to create
            </p>
          )}
          {cols.data && cols.data.length > 0 && visibleCols.length === 0 && search && (
            <p className="px-2 py-1 text-[11px] text-[var(--color-muted-fg)]">No matching collections</p>
          )}
        </div>
      )}
    </div>
  );
}
