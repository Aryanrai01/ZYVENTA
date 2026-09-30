import type { Metadata } from 'next';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { OrderList } from '@/features/orders/order-list';

export const metadata: Metadata = { title: 'Your orders', robots: { index: false, follow: false } };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your orders</h1>
      <RequireAuth>
        <OrderList />
      </RequireAuth>
    </div>
  );
}
