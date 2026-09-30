import type { Metadata } from 'next';
import { AdminOrderList } from '@/features/admin/admin-orders';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return <AdminOrderList />;
}
