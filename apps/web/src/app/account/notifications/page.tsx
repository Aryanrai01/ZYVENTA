import type { Metadata } from 'next';
import { NotificationSettings } from '@/features/account/components/notification-settings';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return <NotificationSettings />;
}
