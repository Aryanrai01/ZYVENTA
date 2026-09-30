'use client';

import {
  BadgeCheck,
  CreditCard,
  Flag,
  FolderTree,
  LayoutDashboard,
  MessageSquare,
  PackageOpen,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  ShoppingBag,
  Store,
  TicketPercent,
  Undo2,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardShell, type DashboardNavItem } from '@/components/layout/dashboard-shell';

const NAV: DashboardNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/returns', label: 'Returns', icon: Undo2 },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/refunds', label: 'Refunds', icon: ReceiptIndianRupee },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/applications', label: 'Seller applications', icon: BadgeCheck },
  { href: '/admin/sellers', label: 'Sellers', icon: Store },
  { href: '/admin/products', label: 'Products', icon: PackageOpen },
  { href: '/admin/catalog', label: 'Categories & brands', icon: FolderTree },
  { href: '/admin/promotions', label: 'Offers & coupons', icon: TicketPercent },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <DashboardShell title="Admin" items={NAV}>
      {children}
    </DashboardShell>
  );
}
