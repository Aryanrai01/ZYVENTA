'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Menu } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { AuthMenu } from './auth-menu';
import { Logo } from './logo';

export interface DashboardNavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Exact match only (for the dashboard root). */
  exact?: boolean;
}

function NavList({ items, onNavigate }: { items: DashboardNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const current = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                current
                  ? 'bg-primary-soft font-medium text-primary'
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
  );
}

/** Shell for Seller Center and Admin: sidebar on desktop, slide-in menu on phones. */
export function DashboardShell({
  title,
  items,
  children,
}: {
  title: string;
  items: DashboardNavItem[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" title={title}>
              <nav aria-label={title} className="p-2">
                <NavList
                  items={items}
                  onNavigate={() => {
                    setOpen(false);
                  }}
                />
              </nav>
            </SheetContent>
          </Sheet>
          <Logo className="shrink-0" />
          <span className="hidden rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground sm:inline">
            {title}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="hidden items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:inline-flex"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Storefront
            </Link>
            <AuthMenu />
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r bg-card p-3 lg:block">
          <nav aria-label={title}>
            <NavList items={items} />
          </nav>
        </aside>
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
