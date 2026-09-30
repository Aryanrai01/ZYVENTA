import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/components/login-form';
import { AuthFormSkeleton } from '@/features/auth/components/auth-form-skeleton';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your ZYVENTA account.',
};

export default function Page() {
  // Suspense: the form reads search params (?next, ?token) on the client.
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
