'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from '@zyventa/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordField, TextField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { applyApiError } from '../form-errors';
import { useRegister } from '../use-auth';
import { AuthHeading } from './auth-heading';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeRedirectPath(params.get('next'), '/account?welcome=1');
  const registerMutation = useRegister();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await registerMutation.mutateAsync({ ...values, phone: values.phone || undefined });
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFormError(applyApiError(error, setError, ['name', 'email', 'password', 'phone']));
    }
  });

  return (
    <>
      <AuthHeading
        title="Create your account"
        description={
          <>
            Already have one?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        <TextField
          label="Full name"
          autoComplete="name"
          autoFocus
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Mobile number (optional)"
          type="tel"
          autoComplete="tel-national"
          inputMode="numeric"
          maxLength={10}
          hint="10-digit Indian mobile number, for delivery updates"
          error={errors.phone?.message}
          {...register('phone', { setValueAs: (v: string) => (v === '' ? undefined : v) })}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, with a letter and a number`}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" fullWidth loading={registerMutation.isPending}>
          Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to ZYVENTA’s Terms of Use and Privacy Policy.
        </p>
      </form>
    </>
  );
}
