import type { Metadata } from 'next';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { ApplyToSell } from '@/features/sell/apply-to-sell';

export const metadata: Metadata = {
  title: 'Sell on ZYVENTA',
  description: 'Open your store on ZYVENTA and reach shoppers across India.',
};

export default function SellPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Sell on ZYVENTA</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Apply in a few minutes. Once approved, list products and start receiving orders.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <ApplyToSell />
        </RequireAuth>
      </div>
    </div>
  );
}
