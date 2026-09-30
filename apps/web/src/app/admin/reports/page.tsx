import type { Metadata } from 'next';
import { AdminReports } from '@/features/admin/admin-moderation';

export const metadata: Metadata = { title: 'Reports' };

export default function Page() {
  return <AdminReports />;
}
