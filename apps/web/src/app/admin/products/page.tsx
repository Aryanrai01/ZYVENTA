import type { Metadata } from 'next';
import { AdminProducts } from '@/features/admin/admin-catalog';

export const metadata: Metadata = { title: 'Products' };

export default function Page() {
  return <AdminProducts />;
}
