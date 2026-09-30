'use client';

import { Heart, Home, LayoutGrid, ShoppingCart, User } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useCartCount } from '@/features/cart/use-cart';
import { cn } from '@/lib/utils';
import { CountBadge } from './header-actions';

const TABS: { href: Route; label: string; icon: typeof Home; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  {
    href: '/categories',
    label: 'Categories',
    icon: LayoutGrid,
    match: (p) => p.startsWith('/categories'),
  },
  { href: '/wishlist', label: 'Wishlist', icon: Heart, match: (p) => p.startsWith('/wishlist') },
  { href: '/cart', label: 'Cart', icon: ShoppingCart, match: (p) => p.startsWith('/cart') },
  { href: '/account', label: 'Account', icon: User, match: (p) => p.startsWith('/account') },
];

/** Thumb-reachable primary navigation on phones (hidden from md up). */
export function MobileTabBar() {
  const pathname = usePathname();
  const count = useCartCount();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const current = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  current ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {href === '/cart' ? <CountBadge count={count} /> : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
