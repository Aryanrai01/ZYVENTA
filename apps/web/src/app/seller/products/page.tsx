import type { Metadata } from 'next';
import { SellerProductList } from '@/features/seller/seller-products';

export const metadata: Metadata = { title: 'Products' };

export default function Page() {
  return <SellerProductList />;
}
