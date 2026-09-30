'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, passwordSchema } from '@zyventa/shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth.service';
import { applyApiError } from '../form-errors';
import { AuthHeading } from './auth-heading';

const formSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState('');
  const [formError, setFormError] = useState('');
  const mutation = useMutation({ mutationFn: authService.resetPassword });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), mode: 'onTouched' });

  if (!token) {
    return (
      <>
        <AuthHeading title="Link incomplete" />
        <Alert variant="error">
          This reset link is missing its security token. Open the link from your email again, or
          request a new one.
        </Alert>
        <Button asChild className="mt-6" fullWidth>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError('');
    try {
      setDone(await mutation.mutateAsync({ token, password }));
    } catch (error) {
      setFormError(applyApiError(error, setError, ['password']));
    }
  });

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description="You’ll be signed out on all devices."
      />
      {done ? (
        <div className="space-y-6">
          <Alert variant="success" title="Password updated">
            {done}
          </Alert>
          <Button asChild fullWidth size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {formError ? (
            <Alert variant="error">
              {formError}{' '}
              <Link href="/forgot-password" className="font-medium text-primary underline">
                Request a new link
              </Link>
            </Alert>
          ) : null}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            autoFocus
            hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, with a letter and a number`}
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Button type="submit" size="lg" fullWidth loading={mutation.isPending}>
            Update password
          </Button>
        </form>
      )}
    </>
  );
}
