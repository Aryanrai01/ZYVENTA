'use client';

import { PageHeader } from '@/components/layout/dashboard-shell';
import { ReturnsTable } from '@/features/seller/returns-table';
import { sellerService } from '@/services/seller.service';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Returns"
        description="Receiving a return puts the units back in stock and refunds the customer."
      />
      <ReturnsTable
        queryKey="seller-returns"
        load={sellerService.returns}
        decide={sellerService.decideReturn}
      />
    </>
  );
}
