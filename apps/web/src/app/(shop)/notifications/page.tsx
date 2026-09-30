import type { Metadata } from 'next';
import { RequireAuth } from '@/features/auth/components/require-auth';
import { NotificationList } from '@/features/notifications/notification-list';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
      <RequireAuth>
        <NotificationList />
      </RequireAuth>
    </div>
  );
}
