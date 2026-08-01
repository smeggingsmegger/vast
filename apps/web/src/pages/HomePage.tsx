import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Cable,
  CheckCircle2,
  Loader2,
  Plus,
  PlugZap,
  Trash2,
  Unplug,
} from 'lucide-react';
import type { ConnectionPublic } from '@vast/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function HomePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await api.listConnections()).data,
  });

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Connect to MongoDB instances. Credentials stay on the server — never in the browser.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add connection
        </Button>
      </div>

      {showForm && (
        <div className="mb-8">
          <ConnectionForm
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              void qc.invalidateQueries({ queryKey: ['connections'] });
            }}
          />
        </div>
      )}

      {connections.isLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading connections…
        </div>
      )}

      {connections.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Failed to load connections. Is the Vast server running?
        </div>
      )}

      {connections.data && connections.data.length === 0 && !showForm && (
        <EmptyState onAdd={() => setShowForm(true)} />
      )}

      {connections.data && connections.data.length > 0 && (
        <ul className="grid gap-3">
          {connections.data.map((conn) => (
            <ConnectionCard key={conn.id} connection={conn} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <Cable className="h-7 w-7" />
      </div>
      <h2 className="text-lg font-medium">No connections yet</h2>
      <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
        Add a MongoDB connection string to start browsing databases, running queries, and editing
        documents.
      </p>
      <Button className="mt-6" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add your first connection
      </Button>
    </div>
  );
}

function ConnectionForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('Local');
  const [uri, setUri] = useState('mongodb://localhost:27017');
  const [readOnly, setReadOnly] = useState(false);
  const [testing, setTesting] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createConnection({ name, uri, readOnly, color: 'teal' }),
    onSuccess: () => {
      toast.success('Connection saved');
      onCreated();
    },
    onError: (err: Error) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save');
    },
  });

  async function handleTest() {
    setTesting(true);
    try {
      const { data } = await api.testUri(uri);
      if (data.ok) {
        toast.success(data.message + (data.serverVersion ? ` (MongoDB ${data.serverVersion})` : ''));
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        New connection
      </h2>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--color-muted)]">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--color-muted)]">Connection URI</span>
          <Input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="mongodb://user:pass@host:27017"
            className="font-mono text-xs"
            spellCheck={false}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="rounded border-[var(--color-border)]"
          />
          Read-only (block writes and destructive operations)
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={testing || !uri}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Test
          </Button>
          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || !name || !uri}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save connection
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConnectionCard({ connection }: { connection: ConnectionPublic }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const connect = useMutation({
    mutationFn: () => api.connect(connection.id),
    onSuccess: (res) => {
      if (res.data.status === 'connected') {
        toast.success(`Connected to ${connection.name}`);
        navigate(`/c/${connection.id}`);
      } else {
        toast.error(res.data.lastError ?? 'Connection failed');
      }
      void qc.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => api.disconnect(connection.id),
    onSuccess: () => {
      toast.message('Disconnected');
      void qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteConnection(connection.id),
    onSuccess: () => {
      toast.success('Connection removed');
      void qc.invalidateQueries({ queryKey: ['connections'] });
    },
  });

  const statusTone =
    connection.status === 'connected'
      ? 'success'
      : connection.status === 'error'
        ? 'danger'
        : 'default';

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition-colors hover:bg-[var(--color-card-hover)]',
      )}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        aria-hidden
      >
        <Cable className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{connection.name}</h3>
          <Badge tone={statusTone}>{connection.status}</Badge>
          {connection.readOnly && <Badge tone="warning">read-only</Badge>}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted-fg)]">
          {connection.uriDisplay}
        </p>
        {connection.lastError && (
          <p className="mt-1 text-xs text-red-400">{connection.lastError}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {connection.status === 'connected' ? (
          <>
            <Button size="sm" onClick={() => navigate(`/c/${connection.id}`)}>
              Open
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Connect
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete connection"
          onClick={() => {
            if (confirm(`Remove connection “${connection.name}”?`)) remove.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        </Button>
      </div>
    </li>
  );
}
