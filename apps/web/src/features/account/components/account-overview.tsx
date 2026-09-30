'use client';

import { Bell, Heart, KeyRound, MapPin, Package, ShoppingCart, Store } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/use-auth';
import { EmailVerificationBanner } from './email-verification-banner';

const SHORTCUTS: { href: Route; label: string; icon: typeof Heart }[] = [
  { href: '/orders', label: 'Your orders', icon: Package },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/cart', label: 'Your cart', icon: ShoppingCart },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/addresses', label: 'Saved addresses', icon: MapPin },
  { href: '/account/security', label: 'Password & sign-in security', icon: KeyRound },
];

const dateFormatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

export function AccountOverview() {
  const { user } = useAuth();
  const welcome = useSearchParams().get('welcome') === '1';
  if (!user) return null; // RequireAuth renders the loading state

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Hi, {user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your profile, addresses and security settings.
        </p>
      </div>

      {welcome ? (
        <Alert variant="success" title="Welcome to ZYVENTA!">
          Your account is ready.
        </Alert>
      ) : null}
      {!user.emailVerified ? <EmailVerificationBanner email={user.email} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section
          className="rounded-xl border bg-card p-5 shadow-card"
          aria-labelledby="profile-heading"
        >
          <h2 id="profile-heading" className="font-semibold">
            Profile
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Name" value={user.name} />
            <Row label="Email" value={user.email} />
            <Row label="Mobile" value={user.phone ?? 'Not added'} />
            <Row label="Member since" value={dateFormatter.format(new Date(user.createdAt))} />
          </dl>
        </section>

        <section
          className="rounded-xl border bg-card p-5 shadow-card"
          aria-labelledby="shortcuts-heading"
        >
          <h2 id="shortcuts-heading" className="font-semibold">
            Shortcuts
          </h2>
          <ul className="mt-4 space-y-1">
            {SHORTCUTS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
            {user.seller ? (
              <li>
                <Link
                  href="/seller"
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  <Store className="size-4 text-primary" aria-hidden="true" />
                  Seller Center — {user.seller.storeName}
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  );
}
