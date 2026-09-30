import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PriceProps {
  price: number;
  mrp: number;
  discountPercent: number;
  /** "from ₹X" when variants differ in price. */
  fromPrefix?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Selling price, struck-through MRP and discount — MRP shown only when higher (Indian norm). */
export function Price({
  price,
  mrp,
  discountPercent,
  fromPrefix,
  size = 'md',
  className,
}: PriceProps) {
  const hasDiscount = mrp > price && discountPercent > 0;
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span
        className={cn(
          'font-semibold text-price tabular-nums',
          size === 'sm' && 'text-base',
          size === 'md' && 'text-lg',
          size === 'lg' && 'text-3xl font-bold',
        )}
      >
        {fromPrefix ? (
          <span className="text-sm font-normal text-muted-foreground">from </span>
        ) : null}
        {formatPrice(price)}
      </span>
      {hasDiscount ? (
        <>
          <span
            className={cn(
              'text-price-strike tabular-nums line-through',
              size === 'lg' ? 'text-base' : 'text-sm',
            )}
          >
            <span className="sr-only">M.R.P. </span>
            {formatPrice(mrp)}
          </span>
          <span
            className={cn('font-semibold text-discount', size === 'lg' ? 'text-base' : 'text-sm')}
          >
            {discountPercent}% off
          </span>
        </>
      ) : null}
    </div>
  );
}
