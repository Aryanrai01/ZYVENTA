'use client';

import { PageHeader } from '@/components/layout/dashboard-shell';
import { ReturnsTable } from '@/features/seller/returns-table';
import { adminService } from '@/services/admin.service';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Returns"
        description="Marketplace-wide return queue. Admin decisions override the seller's."
      />
      <ReturnsTable
        queryKey="admin-returns"
        load={adminService.returns}
        decide={adminService.decideReturn}
      />
    </>
  );
}
