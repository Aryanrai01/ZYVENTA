'use client';

import {
  Bell,
  BellRing,
  Heart,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Package,
  Store,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS: { href: Route; label: string; icon: typeof Bell }[] = [
  { href: '/account', label: 'Overview', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/account/profile', label: 'Profile', icon: UserRound },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/stock-alerts', label: 'Stock alerts', icon: BellRing },
  { href: '/account/notifications', label: 'Email preferences', icon: Bell },
  { href: '/account/security', label: 'Security', icon: KeyRound },
  { href: '/sell', label: 'Sell on ZYVENTA', icon: Store },
];

/** Sidebar on desktop; a horizontally scrolling tab strip on phones. */
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="min-w-0">
      <ul className="-mx-4 scrollbar-none flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-0.5 md:px-0">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const current = href === '/account' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap md:rounded-md md:border-0 md:px-3 md:py-2',
                  current
                    ? 'border-primary bg-primary-soft font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
