import type { Metadata } from 'next';
import { AdminRefunds } from '@/features/admin/admin-payments';

export const metadata: Metadata = { title: 'Refunds' };

export default function Page() {
  return <AdminRefunds />;
}
