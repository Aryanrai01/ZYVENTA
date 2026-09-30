import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/features/auth/components/register-form';
import { AuthFormSkeleton } from '@/features/auth/components/auth-form-skeleton';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a ZYVENTA account to shop from verified sellers.',
};

export default function Page() {
  // Suspense: the form reads search params (?next, ?token) on the client.
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}
