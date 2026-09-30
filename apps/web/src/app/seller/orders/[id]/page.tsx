import type { Metadata } from 'next';
import { SellerOrderDetailView } from '@/features/seller/seller-orders';

export const metadata: Metadata = { title: 'Order' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <SellerOrderDetailView id={(await params).id} />;
}
