import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Plus, Table2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

export function DatabasePage() {
  const { cid = '', db: dbParam = '' } = useParams();
  const db = decodeURIComponent(dbParam);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  const cols = useQuery({
    queryKey: ['cols', cid, db],
    queryFn: async () => (await api.listCollections(cid, db)).data,
    enabled: !!cid && !!db,
  });

  const create = useMutation({
    mutationFn: () => api.createCollection(cid, db, name.trim()),
    onSuccess: () => {
      toast.success('Collection created');
      setShowNew(false);
      setName('');
      void qc.invalidateQueries({ queryKey: ['cols', cid, db] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drop = useMutation({
    mutationFn: (n: string) => api.dropCollection(cid, db, n),
    onSuccess: () => {
      toast.success('Collection dropped');
      setDropTarget(null);
      setConfirm('');
      void qc.invalidateQueries({ queryKey: ['cols', cid, db] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dump = useMutation({
    mutationFn: () => api.dump(cid, db),
    onSuccess: (res) => {
      toast.success(`Dump complete: ${res.data.collections.map((c) => `${c.name}(${c.count})`).join(', ')}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted-fg)]">
        <Link to="/" className="hover:text-[var(--color-foreground)]">
          Connections
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link to={`/c/${cid}`} className="hover:text-[var(--color-foreground)]">
          Connection
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>{db}</span>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{db}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => dump.mutate()} disabled={dump.isPending}>
            Dump database
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" />
            New collection
          </Button>
        </div>
      </div>

      {cols.isLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading collections…
        </div>
      )}
      {cols.data && cols.data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-12 text-center text-sm text-[var(--color-muted)]">
          No collections yet.
        </div>
      )}
      {cols.data && cols.data.length > 0 && (
        <ul className="grid gap-2">
          {cols.data.map((col) => (
            <li
              key={col.name}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
            >
              <Table2 className="h-4 w-4 text-[var(--color-accent)]" />
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                aria-label={col.name}
                onClick={() =>
                  navigate(
                    `/c/${cid}/db/${encodeURIComponent(db)}/col/${encodeURIComponent(col.name)}`,
                  )
                }
              >
                <span className="font-medium">{col.name}</span>
                {col.estimatedCount != null && (
                  <span className="ml-2 font-mono text-xs text-[var(--color-muted-fg)]" aria-hidden>
                    ~{col.estimatedCount} docs
                  </span>
                )}
              </button>
              <Button size="sm" variant="ghost" onClick={() => setDropTarget(col.name)}>
                <Trash2 className="h-3.5 w-3.5 text-[var(--color-muted)]" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={showNew} onClose={() => setShowNew(false)} title="Create collection">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="users" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowNew(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
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
        title="Drop collection"
      >
        <p className="text-sm text-[var(--color-muted)]">
          Type <strong className="text-[var(--color-foreground)]">{dropTarget}</strong> to confirm.
        </p>
        <Input className="mt-3" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDropTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={confirm !== dropTarget || drop.isPending}
            onClick={() => dropTarget && drop.mutate(dropTarget)}
          >
            Drop collection
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
