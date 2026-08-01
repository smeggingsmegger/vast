import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, Moon, Settings, Sun, PanelLeft, Command } from 'lucide-react';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function AppShell() {
  const location = useLocation();
  const { theme, setTheme, sidebarOpen, setSidebarOpen } = useUiStore();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 });

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-card)] px-3">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="px-2"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
            <Database className="h-4 w-4" />
          </span>
          <span>Vast</span>
        </Link>
        <div className="flex-1" />
        {meta.data && (
          <div className="hidden items-center gap-2 sm:flex">
            <Badge tone="accent">{meta.data.runtime}</Badge>
            <span className="font-mono text-xs text-[var(--color-muted-fg)]">
              v{meta.data.version}
            </span>
          </div>
        )}
        <span className="hidden items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-muted-fg)] md:inline-flex">
          <Command className="h-3 w-3" />K
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Link to="/settings">
          <Button
            variant="ghost"
            size="sm"
            className={cn('px-2', location.pathname === '/settings' && 'bg-[var(--color-card-hover)]')}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)]">
            <nav className="flex flex-col gap-1 p-3">
              <NavLink to="/" active={location.pathname === '/'}>
                Connections
              </NavLink>
              <NavLink to="/settings" active={location.pathname === '/settings'}>
                Settings
              </NavLink>
            </nav>
            <div className="mt-auto border-t border-[var(--color-border)] p-3 text-[11px] text-[var(--color-muted-fg)]">
              MongoDB workbench
            </div>
          </aside>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
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
        'rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-foreground)]',
      )}
    >
      {children}
    </Link>
  );
}
