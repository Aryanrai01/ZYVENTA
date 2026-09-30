import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/features/auth/components/verify-email';
import { AuthFormSkeleton } from '@/features/auth/components/auth-form-skeleton';

export const metadata: Metadata = {
  title: 'Verify email',
  description: 'Confirm your ZYVENTA email address.',
  robots: { index: false, follow: false },
};

export default function Page() {
  // Suspense: the form reads search params (?next, ?token) on the client.
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <VerifyEmail />
    </Suspense>
  );
}
