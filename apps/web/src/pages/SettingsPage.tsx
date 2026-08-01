import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function SettingsPage() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15_000 });
  const { theme, setTheme } = useUiStore();

  return (
    <div className="h-full min-h-0 overflow-auto">
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Appearance and runtime information.</p>

      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Theme
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={theme === t ? 'primary' : 'secondary'}
              onClick={() => setTheme(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Runtime
        </h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <Row label="Status">
            {health.data?.status === 'ok' ? (
              <Badge tone="success">healthy</Badge>
            ) : (
              <Badge tone="danger">unknown</Badge>
            )}
          </Row>
          <Row label="Version">{meta.data?.version ?? '…'}</Row>
          <Row label="Runtime">
            <Badge tone="accent">{meta.data?.runtime ?? '…'}</Badge>
          </Row>
          <Row label="Auth mode">{meta.data?.authMode ?? '…'}</Row>
          <Row label="Uptime">
            {health.data ? `${health.data.uptimeSec}s` : '…'}
          </Row>
        </dl>
      </section>
    </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-mono text-xs">{children}</dd>
    </div>
  );
}
