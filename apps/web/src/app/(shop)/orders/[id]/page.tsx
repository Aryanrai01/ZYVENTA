import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { OrderDetailView } from '@/features/orders/order-detail';

export const metadata: Metadata = {
  title: 'Order details',
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Breadcrumbs items={[{ name: 'Your orders', href: '/orders' }, { name: 'Order details' }]} />
      <div className="mt-4">
        <RequireAuth>
          <Suspense>
            <OrderDetailView orderId={id} />
          </Suspense>
        </RequireAuth>
      </div>
    </div>
  );
}
