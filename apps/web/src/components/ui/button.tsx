import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]',
          'disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-8 px-3 text-xs',
          size === 'md' && 'h-9 px-4 text-sm',
          size === 'lg' && 'h-11 px-5 text-sm',
          variant === 'primary' &&
            'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:brightness-110',
          variant === 'secondary' &&
            'bg-[var(--color-input)] text-[var(--color-foreground)] hover:bg-[var(--color-card-hover)] border border-[var(--color-border)]',
          variant === 'outline' &&
            'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-card-hover)]',
          variant === 'ghost' && 'bg-transparent hover:bg-[var(--color-card-hover)]',
          variant === 'danger' && 'bg-[var(--color-danger)] text-white hover:brightness-110',
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
