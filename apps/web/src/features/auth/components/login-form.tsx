'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@zyventa/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordField, TextField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { applyApiError } from '../form-errors';
import { useAuth, useLogin } from '../use-auth';
import { AuthHeading } from './auth-heading';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get('next'), '/account');
  const { status } = useAuth();
  const login = useLogin();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onTouched' });

  // Already signed in (e.g. back button): go where they were heading.
  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, next, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await login.mutateAsync(values);
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFormError(applyApiError(error, setError, ['email', 'password']));
    }
  });

  const registerHref = safeRedirectPath(
    `/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`,
  );

  return (
    <>
      <AuthHeading
        title="Welcome back"
        description={
          <>
            New to ZYVENTA?{' '}
            <Link href={registerHref} className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      />
      {params.get('reason') === 'expired' ? (
        <Alert variant="info" className="mb-6" title="Your session has ended">
          Please sign in again to continue.
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          labelAside={
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          }
          {...register('password')}
        />
        <Button type="submit" size="lg" fullWidth loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </>
  );
}
