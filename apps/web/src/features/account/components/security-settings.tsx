'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PASSWORD_MIN_LENGTH,
  changePasswordSchema,
  type ChangePasswordInput,
} from '@zyventa/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PasswordField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { applyApiError } from '@/features/auth/form-errors';
import { useLogout } from '@/features/auth/use-auth';
import { authService } from '@/services/auth.service';

export function SecuritySettings() {
  const router = useRouter();
  const logout = useLogout();
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const change = useMutation({ mutationFn: authService.changePassword });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage('');
    setFormError('');
    try {
      setMessage(await change.mutateAsync(values));
      reset();
    } catch (error) {
      setFormError(applyApiError(error, setError, ['currentPassword', 'newPassword']));
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Password &amp; security</h1>
        <p className="mt-1 text-muted-foreground">Keep your account safe.</p>
      </div>

      <section
        className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
        aria-labelledby="pw-heading"
      >
        <h2 id="pw-heading" className="font-semibold">
          Change password
        </h2>
        <form onSubmit={onSubmit} noValidate className="mt-5 max-w-md space-y-5">
          {message ? <Alert variant="success">{message}</Alert> : null}
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters, with a letter and a number`}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <Button type="submit" loading={change.isPending}>
            Update password
          </Button>
        </form>
      </section>

      <section
        className="rounded-xl border bg-card p-5 shadow-card sm:p-6"
        aria-labelledby="sessions-heading"
      >
        <h2 id="sessions-heading" className="font-semibold">
          Signed-in devices
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Lost a device or signed in somewhere public? Sign out everywhere, including here.
        </p>
        <Button
          variant="destructive"
          className="mt-4"
          loading={logout.isPending}
          onClick={() => {
            logout.mutate('everywhere', {
              onSettled: () => {
                router.replace('/login');
              },
            });
          }}
        >
          Sign out of all devices
        </Button>
      </section>
    </div>
  );
}
