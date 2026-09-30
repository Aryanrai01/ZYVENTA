import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        // 16px text on mobile prevents iOS zoom-on-focus; 44px tall for touch.
        'flex h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base shadow-xs transition-colors placeholder:text-muted-foreground sm:h-10 sm:text-sm',
        'focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive/30',
        className,
      )}
      {...props}
    />
  );
}
