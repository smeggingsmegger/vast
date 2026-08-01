import { useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { tabPath, useTabsStore } from '@/stores/tabs';
import { cn } from '@/lib/utils';

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = useTabsStore((s) => s.tabs);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActive = useTabsStore((s) => s.setActive);
  const closeOthers = useTabsStore((s) => s.closeOthers);
  const closeAll = useTabsStore((s) => s.closeAll);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-1">
      {tabs.map((tab) => {
        const path = tabPath(tab);
        const active = location.pathname === path;
        return (
          <div
            key={tab.id}
            className={cn(
              'group flex max-w-[220px] min-w-[100px] items-center gap-1 rounded-t-md border border-b-0 px-2 text-xs',
              active
                ? 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]'
                : 'border-transparent text-[var(--color-muted)] hover:bg-[var(--color-card-hover)] hover:text-[var(--color-foreground)]',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-1.5 text-left"
              onClick={() => {
                setActive(tab.id);
                navigate(path);
              }}
              onAuxClick={(e) => {
                // Middle-click close
                if (e.button === 1) {
                  e.preventDefault();
                  handleClose(tab.id);
                }
              }}
              title={`${tab.connectionName ? tab.connectionName + ' · ' : ''}${tab.db}.${tab.col}`}
            >
              <span className="font-mono">{tab.col}</span>
              <span className="ml-1 text-[10px] text-[var(--color-muted-fg)]">{tab.db}</span>
            </button>
            <button
              type="button"
              className={cn(
                'rounded p-0.5 text-[var(--color-muted-fg)] hover:bg-[var(--color-input)] hover:text-[var(--color-foreground)]',
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              aria-label={`Close ${tab.col}`}
              onClick={(e) => {
                e.stopPropagation();
                handleClose(tab.id);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      {tabs.length > 1 && (
        <div className="ml-auto flex shrink-0 items-center gap-1 px-1">
          <button
            type="button"
            className="text-[10px] text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
            onClick={() => {
              const active = tabs.find((t) => location.pathname === tabPath(t));
              if (active) closeOthers(active.id);
            }}
          >
            Close others
          </button>
          <span className="text-[var(--color-border)]">·</span>
          <button
            type="button"
            className="text-[10px] text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)]"
            onClick={() => {
              closeAll();
              navigate('/');
            }}
          >
            Close all
          </button>
        </div>
      )}
    </div>
  );

  function handleClose(id: string) {
    const nextId = closeTab(id);
    const remaining = useTabsStore.getState().tabs;
    if (nextId) {
      const next = remaining.find((t) => t.id === nextId);
      if (next) navigate(tabPath(next));
      else navigate('/');
    } else if (remaining.length === 0) {
      navigate('/');
    }
  }
}
