'use client';

import { Heart, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useCartCount } from '@/features/cart/use-cart';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { AuthMenu } from './auth-menu';

export function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function HeaderActions() {
  const count = useCartCount();
  return (
    <div className="flex items-center gap-1">
      <Link
        href="/wishlist"
        className="hidden size-10 items-center justify-center rounded-md hover:bg-muted md:inline-flex"
        aria-label="Wishlist"
      >
        <Heart className="size-5" aria-hidden="true" />
      </Link>
      <NotificationBell />
      <Link
        href="/cart"
        className="relative inline-flex size-10 items-center justify-center rounded-md hover:bg-muted"
        aria-label={count > 0 ? `Cart, ${String(count)} items` : 'Cart'}
      >
        <ShoppingCart className="size-5" aria-hidden="true" />
        <CountBadge count={count} />
      </Link>
      <AuthMenu />
    </div>
  );
}
