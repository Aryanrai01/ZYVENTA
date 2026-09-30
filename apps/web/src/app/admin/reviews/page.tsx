import type { Metadata } from 'next';
import { AdminReviews } from '@/features/admin/admin-moderation';

export const metadata: Metadata = { title: 'Reviews' };

export default function Page() {
  return <AdminReviews />;
}
