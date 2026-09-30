import type { Metadata } from 'next';
import { AdminDashboardView } from '@/features/admin/admin-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <AdminDashboardView />;
}
