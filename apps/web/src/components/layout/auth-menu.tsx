'use client';

import {
  Bell,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Shield,
  Store,
  User,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth, useLogout } from '@/features/auth/use-auth';

/** Header account control: sign-in links for visitors, a menu for signed-in users. */
export function AuthMenu() {
  const { user, status } = useAuth();
  const logout = useLogout();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && containerRef.current?.contains(event.target as Node))
        return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (status === 'loading') {
    return <div className="h-9 w-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
          <Link href="/login">
            <User aria-hidden="true" />
            <span>Sign in</span>
          </Link>
        </Button>
        <Button asChild size="sm" className="hidden lg:inline-flex">
          <Link href="/register">Create account</Link>
        </Button>
      </div>
    );
  }

  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <User aria-hidden="true" />
        <span className="hidden max-w-28 truncate sm:inline">{firstName}</span>
        <span className="sr-only sm:hidden">Account menu</span>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-overlay"
        >
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email}</p>
          <MenuLink
            href="/account"
            icon={LayoutDashboard}
            label="Your account"
            onSelect={() => {
              setOpen(false);
            }}
          />
          <MenuLink
            href="/orders"
            icon={Package}
            label="Orders"
            onSelect={() => {
              setOpen(false);
            }}
          />
          <MenuLink
            href="/notifications"
            icon={Bell}
            label="Notifications"
            onSelect={() => {
              setOpen(false);
            }}
          />
          <MenuLink
            href="/wishlist"
            icon={Heart}
            label="Wishlist"
            onSelect={() => {
              setOpen(false);
            }}
          />
          <MenuLink
            href="/account/addresses"
            icon={MapPin}
            label="Addresses"
            onSelect={() => {
              setOpen(false);
            }}
          />
          {user.roles.includes('SELLER') ? (
            <MenuLink
              href="/seller"
              icon={Store}
              label="Seller Center"
              onSelect={() => {
                setOpen(false);
              }}
            />
          ) : null}
          {user.roles.includes('ADMIN') ? (
            <MenuLink
              href="/admin"
              icon={Shield}
              label="Admin"
              onSelect={() => {
                setOpen(false);
              }}
            />
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              logout.mutate('device', {
                onSettled: () => {
                  router.replace('/');
                  router.refresh();
                },
              });
            }}
          >
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onSelect,
}: {
  href: Route;
  icon: typeof User;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
    >
      <Icon className="size-4" aria-hidden="true" /> {label}
    </Link>
  );
}
