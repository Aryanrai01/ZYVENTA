import type { Metadata } from 'next';
import { AdminUsers } from '@/features/admin/admin-people';

export const metadata: Metadata = { title: 'Users' };

export default function Page() {
  return <AdminUsers />;
}
