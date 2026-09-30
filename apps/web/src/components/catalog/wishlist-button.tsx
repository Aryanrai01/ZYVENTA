'use client';

import { Heart } from 'lucide-react';
import { useToggleWishlist, useWishlistIds } from '@/features/wishlist/use-wishlist';
import { cn } from '@/lib/utils';

export function WishlistButton({
  productId,
  productName,
  className,
  variant = 'overlay',
}: {
  productId: string;
  productName: string;
  className?: string;
  variant?: 'overlay' | 'outline';
}) {
  const saved = useWishlistIds().includes(productId);
  const { toggle } = useToggleWishlist();

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(productId, saved);
      }}
      className={cn(
        'inline-flex items-center justify-center transition-colors',
        variant === 'overlay' &&
          'size-9 rounded-full bg-card/90 text-muted-foreground shadow-card backdrop-blur hover:text-destructive',
        variant === 'outline' &&
          'size-11 rounded-md border border-input bg-card text-muted-foreground hover:text-destructive',
        saved && 'text-destructive',
        className,
      )}
    >
      <Heart className={cn('size-5', saved && 'fill-current')} aria-hidden="true" />
    </button>
  );
}
