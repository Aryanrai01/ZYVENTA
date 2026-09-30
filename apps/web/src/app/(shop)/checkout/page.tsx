import type { Metadata } from 'next';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { CheckoutView } from '@/features/checkout/checkout-view';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Checkout</h1>
      <RequireAuth>
        <CheckoutView />
      </RequireAuth>
    </div>
  );
}
