'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { CountBadge } from '@/components/layout/header-actions';
import { useAuth } from '@/features/auth/use-auth';
import { engagementService } from '@/services/commerce.service';

export const notificationKeys = {
  unread: ['notifications', 'unread'] as const,
  all: ['notifications'] as const,
};

/** Header bell with the unread count (polled gently while the tab is open). */
export function NotificationBell() {
  const { status } = useAuth();
  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: engagementService.unreadCount,
    enabled: status === 'authenticated',
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (status !== 'authenticated') return null;
  const count = unread.data ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative hidden size-10 items-center justify-center rounded-md hover:bg-muted sm:inline-flex"
      aria-label={count > 0 ? `Notifications, ${String(count)} unread` : 'Notifications'}
    >
      <Bell className="size-5" aria-hidden="true" />
      <CountBadge count={count} />
    </Link>
  );
}
