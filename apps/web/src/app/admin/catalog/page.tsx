import type { Metadata } from 'next';
import { AdminCatalog } from '@/features/admin/admin-catalog';

export const metadata: Metadata = { title: 'Categories & brands' };

export default function Page() {
  return <AdminCatalog />;
}
