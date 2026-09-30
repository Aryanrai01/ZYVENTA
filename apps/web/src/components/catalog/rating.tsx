import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const countFormatter = new Intl.NumberFormat('en-IN', { notation: 'compact' });

/** Compact rating chip ("4.3 ★ (1.2K)"); renders nothing for unrated products. */
export function Rating({
  value,
  count,
  className,
}: {
  value: number;
  count: number;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span className="inline-flex items-center gap-0.5 rounded bg-rating px-1.5 py-0.5 font-semibold text-success-foreground">
        {value.toFixed(1)}
        <Star className="size-3 fill-current" aria-hidden="true" />
      </span>
      <span className="text-muted-foreground">
        ({countFormatter.format(count)})
        <span className="sr-only">
          {' '}
          — rated {value.toFixed(1)} out of 5 from {count} reviews
        </span>
      </span>
    </span>
  );
}
