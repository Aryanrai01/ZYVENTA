import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { AuthFormSkeleton } from '@/features/auth/components/auth-form-skeleton';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new ZYVENTA password.',
  robots: { index: false, follow: false },
};

export default function Page() {
  // Suspense: the form reads search params (?next, ?token) on the client.
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
