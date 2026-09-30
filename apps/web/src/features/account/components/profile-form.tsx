'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  profileFormSchema,
  type ProfileFormValues,
  type ProfileUpdateInput,
} from '@zyventa/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { applyApiError } from '@/features/auth/form-errors';
import { useProfile, useUpdateProfile } from '../hooks/use-account';

export function ProfileSettings() {
  const profile = useProfile();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
        <p className="mt-1 text-muted-foreground">Your name and mobile number for deliveries.</p>
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-card sm:p-6">
        {profile.data ? (
          <ProfileForm
            key={profile.data.id}
            defaults={{ name: profile.data.name, phone: profile.data.phone ?? '' }}
            email={profile.data.email}
          />
        ) : profile.error ? (
          <Alert variant="error">We couldn’t load your profile. Please refresh the page.</Alert>
        ) : (
          <div className="max-w-md space-y-5" aria-busy="true">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileForm({
  defaults,
  email,
}: {
  defaults: { name: string; phone: string };
  email: string;
}) {
  const update = useUpdateProfile();
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: defaults,
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage('');
    setFormError('');
    // Only send what changed.
    const changes: ProfileUpdateInput = {};
    if (dirtyFields.name) changes.name = values.name;
    if (dirtyFields.phone) changes.phone = values.phone;
    try {
      const saved = await update.mutateAsync(changes);
      reset({ name: saved.name, phone: saved.phone ?? '' });
      setMessage('Your profile has been updated.');
    } catch (error) {
      setFormError(applyApiError(error, setError, ['name', 'phone']));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md space-y-5">
      {message ? <Alert variant="success">{message}</Alert> : null}
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        hint="10-digit Indian mobile number. Leave empty to remove."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Email"
        value={email}
        readOnly
        disabled
        hint="Email changes are not available yet."
      />
      <Button type="submit" loading={update.isPending} disabled={!isDirty}>
        Save changes
      </Button>
    </form>
  );
}
