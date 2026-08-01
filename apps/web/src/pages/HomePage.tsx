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
    <div className="h-full min-h-0 overflow-auto">
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
  const [sshEnabled, setSshEnabled] = useState(false);
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('');
  const [sshAuth, setSshAuth] = useState<'password' | 'privateKey'>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshDestHost, setSshDestHost] = useState('127.0.0.1');
  const [sshDestPort, setSshDestPort] = useState('27017');

  function buildSsh() {
    if (!sshEnabled) return undefined;
    return {
      enabled: true,
      host: sshHost,
      port: Number(sshPort) || 22,
      username: sshUser,
      authMethod: sshAuth,
      password: sshAuth === 'password' ? sshPassword : undefined,
      privateKey: sshAuth === 'privateKey' ? sshKey : undefined,
      passphrase: sshAuth === 'privateKey' && sshPassphrase ? sshPassphrase : undefined,
      destinationHost: sshDestHost || undefined,
      destinationPort: Number(sshDestPort) || undefined,
    };
  }

  const create = useMutation({
    mutationFn: () =>
      api.createConnection({
        name,
        uri,
        readOnly,
        color: 'teal',
        ssh: buildSsh(),
      }),
    onSuccess: () => {
      toast.success('Connection saved (credentials encrypted at rest)');
      onCreated();
    },
    onError: (err: Error) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save');
    },
  });

  async function handleTest() {
    setTesting(true);
    try {
      const { data } = await api.testUri(uri, buildSsh());
      if (data.ok) {
        toast.success(
          data.message +
            (data.serverVersion ? ` (MongoDB ${data.serverVersion})` : '') +
            (data.viaSsh ? ' · via SSH' : ''),
        );
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
          <span className="text-[var(--color-muted)]">MongoDB URI</span>
          <Input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="mongodb://user:pass@host:27017"
            className="font-mono text-xs"
            spellCheck={false}
          />
          <span className="text-[11px] text-[var(--color-muted-fg)]">
            With SSH, use the host/port as seen from the bastion (often mongodb://127.0.0.1:27017).
            mongodb+srv is not supported through tunnels.
          </span>
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

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/50 p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={sshEnabled}
              onChange={(e) => setSshEnabled(e.target.checked)}
              className="rounded border-[var(--color-border)]"
            />
            Connect via SSH tunnel
          </label>
          {sshEnabled && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm sm:col-span-1">
                <span className="text-[var(--color-muted)]">SSH host</span>
                <Input value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="bastion.example.com" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--color-muted)]">SSH port</span>
                <Input value={sshPort} onChange={(e) => setSshPort(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-[var(--color-muted)]">SSH username</span>
                <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="ubuntu" />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-[var(--color-muted)]">Auth method</span>
                <select
                  className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-sm"
                  value={sshAuth}
                  onChange={(e) => setSshAuth(e.target.value as 'password' | 'privateKey')}
                >
                  <option value="password">Password</option>
                  <option value="privateKey">Private key (passkey / PEM)</option>
                </select>
              </label>
              {sshAuth === 'password' ? (
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="text-[var(--color-muted)]">SSH password</span>
                  <Input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              ) : (
                <>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="text-[var(--color-muted)]">Private key (PEM)</span>
                    <textarea
                      className="min-h-[100px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-2 font-mono text-[11px]"
                      value={sshKey}
                      onChange={(e) => setSshKey(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      spellCheck={false}
                    />
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2">
                    <span className="text-[var(--color-muted)]">Key passphrase (optional)</span>
                    <Input
                      type="password"
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </>
              )}
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--color-muted)]">Mongo host from bastion</span>
                <Input
                  value={sshDestHost}
                  onChange={(e) => setSshDestHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="font-mono text-xs"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--color-muted)]">Mongo port from bastion</span>
                <Input value={sshDestPort} onChange={(e) => setSshDestPort(e.target.value)} />
              </label>
              <p className="text-[11px] text-[var(--color-muted-fg)] sm:col-span-2">
                Secrets are encrypted with VAST_SECRET_KEY and never returned by the API.
              </p>
            </div>
          )}
        </div>

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
          {connection.ssh?.enabled && <Badge tone="accent">SSH</Badge>}
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
