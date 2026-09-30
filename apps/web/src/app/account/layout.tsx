import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreShell } from '@/components/layout/store-shell';
import { AccountNav } from '@/features/account/components/account-nav';
import { RequireAuth } from '@/features/auth/components/require-auth';

export const metadata: Metadata = {
  title: { default: 'Your account', template: '%s | Your account | ZYVENTA' },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <StoreShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <RequireAuth>
          <div className="grid gap-6 md:grid-cols-[220px_1fr] md:gap-10">
            <AccountNav />
            <div className="min-w-0">{children}</div>
          </div>
        </RequireAuth>
      </div>
    </StoreShell>
  );
}
