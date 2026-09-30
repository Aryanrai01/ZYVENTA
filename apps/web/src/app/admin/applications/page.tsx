import type { Metadata } from 'next';
import { AdminApplications } from '@/features/admin/admin-people';

export const metadata: Metadata = { title: 'Seller applications' };

export default function Page() {
  return <AdminApplications />;
}
