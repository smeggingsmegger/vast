import { Link, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Moon, Settings, Sun, PanelLeft, Command } from 'lucide-react';
import { api } from '@/lib/api';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExplorerSidebar } from '@/components/layout/ExplorerSidebar';
import { TabBar } from '@/components/layout/TabBar';

export function AppShell() {
  const location = useLocation();
  const { theme, setTheme, sidebarOpen, setSidebarOpen } = useUiStore();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 });

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col overflow-hidden">
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
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          title="Vast home"
        >
          <img
            src="/vast-logo.png"
            alt="Vast"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 object-contain"
            draggable={false}
          />
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
      {/* min-h-0 + overflow-hidden: required for WKWebView/Tauri nested scroll */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-sidebar)] md:w-72">
            <ExplorerSidebar />
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [&>*]:min-h-0 [&>*]:flex-1 [&>*]:overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
