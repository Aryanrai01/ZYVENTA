'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADDRESS_LABELS,
  INDIAN_STATES,
  addressInputSchema,
  type AddressFormValues,
  type AddressInput,
  type AddressView,
} from '@zyventa/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { SelectField, TextField } from '@/components/forms/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { applyApiError } from '@/features/auth/form-errors';

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));
const LABEL_TEXT = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const;
const FIELDS = [
  'label',
  'fullName',
  'phone',
  'line1',
  'line2',
  'landmark',
  'city',
  'state',
  'pincode',
  'isDefault',
] as const;

export function AddressForm({
  address,
  onSubmit,
  submitting,
}: {
  address?: AddressView;
  onSubmit: (input: AddressInput) => Promise<void>;
  submitting: boolean;
}) {
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AddressFormValues, unknown, AddressInput>({
    resolver: zodResolver(addressInputSchema),
    mode: 'onTouched',
    defaultValues: address
      ? {
          label: address.label,
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          isDefault: address.isDefault,
        }
      : { label: 'HOME', isDefault: false },
  });

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(applyApiError(error, setError, FIELDS));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-4">
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        hint="For delivery updates from the courier"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Flat, house no., building, street"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register('line1')}
      />
      <TextField
        label="Area, locality (optional)"
        autoComplete="address-line2"
        error={errors.line2?.message}
        {...register('line2')}
      />
      <TextField
        label="Landmark (optional)"
        error={errors.landmark?.message}
        {...register('landmark')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="PIN code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          error={errors.pincode?.message}
          {...register('pincode')}
        />
        <TextField
          label="City"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register('city')}
        />
      </div>
      <SelectField
        label="State"
        autoComplete="address-level1"
        placeholder="Choose a state"
        options={STATE_OPTIONS}
        error={errors.state?.message}
        {...register('state')}
      />
      <fieldset>
        <legend className="text-sm font-medium">Address type</legend>
        <div className="mt-2 flex gap-2">
          {ADDRESS_LABELS.map((label) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary"
            >
              <input type="radio" value={label} className="accent-primary" {...register('label')} />
              {LABEL_TEXT[label]}
            </label>
          ))}
        </div>
      </fieldset>
      {!address?.isDefault ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" {...register('isDefault')} />
          Make this my default address
        </label>
      ) : null}
      <Button type="submit" fullWidth loading={submitting}>
        {address ? 'Save address' : 'Add address'}
      </Button>
    </form>
  );
}
