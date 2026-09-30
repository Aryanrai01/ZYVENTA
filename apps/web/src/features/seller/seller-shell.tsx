'use client';

import {
  Boxes,
  LayoutDashboard,
  MessageSquare,
  Package,
  PackageOpen,
  Settings,
  TicketPercent,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardShell, type DashboardNavItem } from '@/components/layout/dashboard-shell';

const NAV: DashboardNavItem[] = [
  { href: '/seller', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/seller/orders', label: 'Orders', icon: Package },
  { href: '/seller/returns', label: 'Returns', icon: Undo2 },
  { href: '/seller/products', label: 'Products', icon: PackageOpen },
  { href: '/seller/inventory', label: 'Inventory', icon: Boxes },
  { href: '/seller/promotions', label: 'Offers & coupons', icon: TicketPercent },
  { href: '/seller/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/seller/settings', label: 'Store settings', icon: Settings },
];

export function SellerShell({ children }: { children: ReactNode }) {
  return (
    <DashboardShell title="Seller Center" items={NAV}>
      {children}
    </DashboardShell>
  );
}
