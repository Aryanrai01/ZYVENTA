import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InventoryTable } from '@/features/seller/inventory-table';

export const metadata: Metadata = { title: 'Inventory' };

export default function Page() {
  return (
    <Suspense>
      <InventoryTable />
    </Suspense>
  );
}
