import type { Metadata } from 'next';
import { SellerDashboardView } from '@/features/seller/seller-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <SellerDashboardView />;
}
