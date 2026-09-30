import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/admin-shell';
import { RequireAuth } from '@/features/auth/components/require-auth';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin | ZYVENTA' },
  robots: { index: false, follow: false },
};

/** Role-gated shell. The API independently enforces the ADMIN role on every admin route. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminShell>
      <RequireAuth roles={['ADMIN']}>{children}</RequireAuth>
    </AdminShell>
  );
}
