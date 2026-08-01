import { cn } from '@/lib/utils';

export function Badge({
  children,
  className,
  tone = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide',
        tone === 'default' && 'bg-[var(--color-input)] text-[var(--color-muted)]',
        tone === 'success' && 'bg-emerald-500/15 text-emerald-400',
        tone === 'warning' && 'bg-amber-500/15 text-amber-400',
        tone === 'danger' && 'bg-red-500/15 text-red-400',
        tone === 'accent' && 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
