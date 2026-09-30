import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { AuthFormSkeleton } from '@/features/auth/components/auth-form-skeleton';

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Reset your ZYVENTA password.',
  robots: { index: false, follow: false },
};

export default function Page() {
  // Suspense: the form reads search params (?next, ?token) on the client.
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
