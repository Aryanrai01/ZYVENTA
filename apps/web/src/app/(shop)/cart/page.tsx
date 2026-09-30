import type { Metadata } from 'next';
import { CartView } from '@/features/cart/components/cart-view';

export const metadata: Metadata = {
  title: 'Your cart',
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your cart</h1>
      <CartView />
    </div>
  );
}
