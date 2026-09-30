import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { SellerShell } from '@/features/seller/seller-shell';

export const metadata: Metadata = {
  title: { default: 'Seller Center', template: '%s | Seller Center | ZYVENTA' },
  robots: { index: false, follow: false },
};

/** Role-gated shell. The API independently enforces the SELLER role and ownership on every call. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SellerShell>
      <RequireAuth roles={['SELLER']} requireActiveSeller>
        {children}
      </RequireAuth>
    </SellerShell>
  );
}
