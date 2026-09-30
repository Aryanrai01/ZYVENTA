'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@zyventa/shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth.service';
import { applyApiError } from '../form-errors';
import { AuthHeading } from './auth-heading';

export function ForgotPasswordForm() {
  const [sentMessage, setSentMessage] = useState('');
  const [formError, setFormError] = useState('');
  const mutation = useMutation({ mutationFn: authService.forgotPassword });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      setSentMessage(await mutation.mutateAsync(values));
    } catch (error) {
      setFormError(applyApiError(error, setError, ['email']));
    }
  });

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter the email you signed up with and we’ll send you a reset link."
      />
      {sentMessage ? (
        <div className="space-y-6">
          <Alert variant="success" title="Check your inbox">
            {sentMessage} The link expires in 30 minutes.
          </Alert>
          <Button asChild variant="outline" fullWidth>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
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
          <Button type="submit" size="lg" fullWidth loading={mutation.isPending}>
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </>
  );
}
