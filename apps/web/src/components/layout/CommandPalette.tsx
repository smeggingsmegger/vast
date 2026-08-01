import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/stores/ui';

const ACTIONS = [
  { id: 'home', label: 'Go to Connections', path: '/' },
  { id: 'settings', label: 'Go to Settings', path: '/settings' },
  { id: 'theme', label: 'Toggle theme', action: 'theme' as const },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { theme, setTheme } = useUiStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return ACTIONS;
    return ACTIONS.filter((a) => a.label.toLowerCase().includes(qq));
  }, [q]);

  function run(item: (typeof ACTIONS)[number]) {
    if ('action' in item && item.action === 'theme') {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    } else if ('path' in item && item.path) {
      navigate(item.path);
    }
    setOpen(false);
    setQ('');
  }

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Command palette" className="max-w-md">
      <Input
        autoFocus
        placeholder="Type a command…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && items[0]) run(items[0]);
        }}
      />
      <ul className="mt-3 max-h-64 overflow-auto">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-card-hover)]"
              onClick={() => run(item)}
            >
              {item.label}
            </button>
          </li>
        ))}
        {!items.length && (
          <li className="px-3 py-2 text-sm text-[var(--color-muted)]">No matches</li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-[var(--color-muted-fg)]">⌘K / Ctrl+K to toggle</p>
    </Dialog>
  );
}
