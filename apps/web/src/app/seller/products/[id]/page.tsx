import type { Metadata } from 'next';
import { SellerProductEdit } from '@/features/seller/seller-products';

export const metadata: Metadata = { title: 'Edit product' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <SellerProductEdit id={(await params).id} />;
}
