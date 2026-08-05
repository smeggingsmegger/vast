import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  Plus,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';

export function ConnectionPage() {
  const { cid = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newDb, setNewDb] = useState('');
  const [showNewDb, setShowNewDb] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  const conn = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
  });
  const connection = conn.data?.find((c) => c.id === cid);

  const connect = useMutation({
    mutationFn: () => api.connect(cid),
    onSuccess: () => {
      toast.success('Connected');
      void qc.invalidateQueries({ queryKey: ['connections'] });
      void qc.invalidateQueries({ queryKey: ['dbs', cid] });
    },
    onError: (e: Error) => toast.error(e instanceof ApiError ? e.message : e.message),
  });

  // Ensure we are connected when landing on this page (e.g. after navigate from home)
  useEffect(() => {
    if (connection && connection.status !== 'connected' && !connect.isPending && !connect.isSuccess) {
      connect.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when cid/status changes
  }, [cid, connection?.status]);

  const isConnected = connection?.status === 'connected' || connect.isSuccess;

  const dbs = useQuery({
    queryKey: ['dbs', cid],
    queryFn: async () => (await api.listDatabases(cid)).data,
    enabled: !!cid && isConnected,
  });

  const serverInfo = useQuery({
    queryKey: ['server-info', cid],
    queryFn: async () => (await api.serverInfo(cid)).data,
    enabled: !!cid && isConnected,
  });

  const createDb = useMutation({
    mutationFn: () => api.createDatabase(cid, newDb.trim()),
    onSuccess: () => {
      toast.success(`Database ${newDb} created`);
      setShowNewDb(false);
      setNewDb('');
      void qc.invalidateQueries({ queryKey: ['dbs', cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dropDb = useMutation({
    mutationFn: (name: string) => api.dropDatabase(cid, name),
    onSuccess: () => {
      toast.success('Database dropped');
      setDropTarget(null);
      setConfirm('');
      void qc.invalidateQueries({ queryKey: ['dbs', cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!connection) {
    return (
      <div className="p-8 text-sm text-[var(--color-muted)]">
        Connection not found. <Link className="text-[var(--color-accent)]" to="/">Back</Link>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="mb-2 flex items-center gap-1 text-xs text-[var(--color-muted-fg)]">
        <Link to="/" className="hover:text-[var(--color-foreground)]">
          Connections
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>{connection.name}</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{connection.name}</h1>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted-fg)]">{connection.uriDisplay}</p>
          <div className="mt-2 flex gap-2">
            <Badge
              tone={
                connection.status === 'connected'
                  ? 'success'
                  : connection.status === 'error'
                    ? 'danger'
                    : 'default'
              }
            >
              {connection.status}
            </Badge>
            {connection.readOnly && <Badge tone="warning">read-only</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {connection.status !== 'connected' && (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!isConnected}
            onClick={() => navigate(`/c/${cid}/shell`)}
          >
            <Terminal className="h-4 w-4" />
            Script shell
          </Button>
          <Button variant="secondary" onClick={() => setShowNewDb(true)} disabled={!isConnected}>
            <Plus className="h-4 w-4" />
            New database
          </Button>
        </div>
      </div>

      {connection.status === 'connected' && serverInfo.data != null && (
        <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-[var(--color-accent)]" />
            Server info
          </div>
          <pre className="max-h-40 overflow-auto font-mono text-[11px] text-[var(--color-muted)]">
            {JSON.stringify(serverInfo.data as object, null, 2).slice(0, 2000)}
          </pre>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Databases
      </h2>
      {dbs.isLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {dbs.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Failed to list databases. Connect first or check permissions.
        </div>
      )}
      {dbs.data && (
        <ul className="grid gap-2">
          {dbs.data.map((db) => (
            <li
              key={db.name}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 hover:bg-[var(--color-card-hover)]"
            >
              <Database className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-label={db.name}
                onClick={() => navigate(`/c/${cid}/db/${encodeURIComponent(db.name)}`)}
              >
                <span className="font-medium">{db.name}</span>
                {db.sizeOnDisk != null && (
                  <span className="ml-2 font-mono text-xs text-[var(--color-muted-fg)]" aria-hidden>
                    {(db.sizeOnDisk / 1024).toFixed(1)} KB
                  </span>
                )}
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Drop ${db.name}`}
                onClick={() => setDropTarget(db.name)}
                disabled={connection.readOnly || ['admin', 'local', 'config'].includes(db.name)}
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--color-muted)]" />
              </Button>
              <FolderOpen className="h-4 w-4 text-[var(--color-muted-fg)]" />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={showNewDb} onClose={() => setShowNewDb(false)} title="Create database">
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--color-muted)]">Name</span>
          <Input value={newDb} onChange={(e) => setNewDb(e.target.value)} placeholder="my_app" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowNewDb(false)}>
            Cancel
          </Button>
          <Button disabled={!newDb.trim() || createDb.isPending} onClick={() => createDb.mutate()}>
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={!!dropTarget}
        onClose={() => {
          setDropTarget(null);
          setConfirm('');
        }}
        title="Drop database"
      >
        <p className="text-sm text-[var(--color-muted)]">
          This permanently deletes <strong className="text-[var(--color-foreground)]">{dropTarget}</strong>.
          Type the database name to confirm.
        </p>
        <Input
          className="mt-3"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={dropTarget ?? ''}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDropTarget(null);
              setConfirm('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={confirm !== dropTarget || dropDb.isPending}
            onClick={() => dropTarget && dropDb.mutate(dropTarget)}
          >
            Drop database
          </Button>
        </div>
      </Dialog>
    </div>
    </div>
  );
}
