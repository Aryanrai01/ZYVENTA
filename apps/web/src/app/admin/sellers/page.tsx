import type { Metadata } from 'next';
import { AdminSellers } from '@/features/admin/admin-people';

export const metadata: Metadata = { title: 'Sellers' };

export default function Page() {
  return <AdminSellers />;
}
