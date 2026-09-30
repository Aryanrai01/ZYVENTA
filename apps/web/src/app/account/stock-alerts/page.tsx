import type { Metadata } from 'next';
import { StockAlerts } from '@/features/account/components/stock-alerts';

export const metadata: Metadata = { title: 'Stock alerts' };

export default function Page() {
  return <StockAlerts />;
}
