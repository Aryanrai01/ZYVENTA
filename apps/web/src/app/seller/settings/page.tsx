import type { Metadata } from 'next';
import { StoreSettings } from '@/features/seller/store-settings';

export const metadata: Metadata = { title: 'Store settings' };

export default function Page() {
  return <StoreSettings />;
}
