import type { Metadata } from 'next';
import { ProfileSettings } from '@/features/account/components/profile-form';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return <ProfileSettings />;
}
