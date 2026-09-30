import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SellerOrderList } from '@/features/seller/seller-orders';

export const metadata: Metadata = { title: 'Orders' };

export default function Page() {
  return (
    <Suspense>
      <SellerOrderList />
    </Suspense>
  );
}
