'use client';

import type { Role } from '@zyventa/shared';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../use-auth';

interface RequireAuthProps {
  children: ReactNode;
  /** User must hold at least one of these roles. */
  roles?: Role[];
  /** For seller areas: also require an ACTIVE seller profile. */
  requireActiveSeller?: boolean;
}

/**
 * Client-side gate for private areas. This is UX only — it decides what to render; every API
 * call these pages make is independently authenticated and authorised by the backend.
 */
export function RequireAuth({ children, roles, requireActiveSeller = false }: RequireAuthProps) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div
        className="mx-auto max-w-5xl animate-pulse space-y-4 px-4 py-10"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="h-8 w-1/3 rounded-md bg-muted" />
        <div className="h-32 rounded-xl bg-muted" />
        <div className="h-32 rounded-xl bg-muted" />
      </div>
    );
  }

  const roleOk = !roles || roles.some((role) => user.roles.includes(role));
  const sellerOk = !requireActiveSeller || user.seller?.status === 'ACTIVE';
  if (!roleOk || !sellerOk) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <ShieldAlert className="size-10 text-warning" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          You don’t have access to this area
        </h1>
        <p className="mt-2 text-muted-foreground">
          {requireActiveSeller && user.roles.includes('SELLER')
            ? 'Your seller account is not active yet.'
            : 'This section is only available to authorised accounts.'}
        </p>
        <Button asChild className="mt-6">
          <Link href="/account">Go to your account</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
