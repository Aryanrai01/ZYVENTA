import type { Metadata } from 'next';
import { AdminOrderDetailView } from '@/features/admin/admin-orders';

export const metadata: Metadata = { title: 'Order' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminOrderDetailView id={id} />;
}
