import type { Metadata } from 'next';
import { AdminPayments } from '@/features/admin/admin-payments';

export const metadata: Metadata = { title: 'Payments' };

export default function Page() {
  return <AdminPayments />;
}
