import type { ReactNode } from 'react';
import { StoreShell } from '@/components/layout/store-shell';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return <StoreShell>{children}</StoreShell>;
}
