'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BUSINESS_TYPES,
  INDIAN_STATES,
  sellerApplicationInputSchema,
  type SellerApplicationFormValues,
  type SellerApplicationInput,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeIndianRupee, Clock, PackageCheck, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { SelectField, TextField } from '@/components/forms/form-field';
import { toast } from '@/components/feedback/toast';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { applyApiError } from '@/features/auth/form-errors';
import { authKeys, useAuth } from '@/features/auth/use-auth';
import { errorMessage } from '@/features/cart/use-cart';
import { engagementService } from '@/services/commerce.service';

const BUSINESS_LABELS: Record<(typeof BUSINESS_TYPES)[number], string> = {
  INDIVIDUAL: 'Individual',
  PROPRIETORSHIP: 'Sole proprietorship',
  PARTNERSHIP: 'Partnership',
  LLP: 'LLP',
  PRIVATE_LIMITED: 'Private limited',
  PUBLIC_LIMITED: 'Public limited',
};
const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));

const PERKS = [
  {
    icon: Users,
    title: 'Reach shoppers across India',
    text: 'List once and sell to every PIN code we serve.',
  },
  {
    icon: BadgeIndianRupee,
    title: 'Transparent fees',
    text: 'A simple commission per sale. No listing fees.',
  },
  {
    icon: PackageCheck,
    title: 'Tools that scale',
    text: 'Inventory, orders, returns and offers in one place.',
  },
];

export function ApplyToSell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const application = useQuery({
    queryKey: ['seller-application'],
    queryFn: engagementService.myApplication,
    enabled: Boolean(user),
  });
  const [reapply, setReapply] = useState(false);
  const withdraw = useMutation({
    mutationFn: engagementService.withdrawApplication,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['seller-application'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!user) return null;
  if (user.seller) {
    return (
      <Alert variant="success" title={`You sell as ${user.seller.storeName}`}>
        <Link href="/seller" className="font-medium underline">
          Open Seller Center
        </Link>
      </Alert>
    );
  }
  if (application.isPending) return <Skeleton className="h-64 rounded-xl" />;
  const app = application.data;

  if (app?.status === 'PENDING') {
    return (
      <section className="rounded-xl border bg-card p-6 text-center shadow-card">
        <Clock className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold">Your application is under review</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          We review {app.storeName} within 2 working days and will email you the decision.
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          loading={withdraw.isPending}
          onClick={() => {
            withdraw.mutate();
          }}
        >
          Withdraw application
        </Button>
      </section>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        {app?.status === 'REJECTED' && !reapply ? (
          <Alert variant="warning" title="Your previous application wasn’t approved">
            {app.rejectionReason}{' '}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => {
                setReapply(true);
              }}
            >
              Apply again
            </button>
          </Alert>
        ) : (
          <ApplicationForm
            emailVerified={user.emailVerified}
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ['seller-application'] });
              void queryClient.invalidateQueries({ queryKey: authKeys.me });
            }}
          />
        )}
      </div>
      <aside className="space-y-4">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-xl border bg-card p-4 shadow-card">
            <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

function ApplicationForm({
  emailVerified,
  onDone,
}: {
  emailVerified: boolean;
  onDone: () => void;
}) {
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SellerApplicationFormValues, unknown, SellerApplicationInput>({
    resolver: zodResolver(sellerApplicationInputSchema),
    mode: 'onTouched',
    defaultValues: { businessType: 'PROPRIETORSHIP', gstin: '', intendedCategories: [] },
  });
  const individual = useWatch({ control, name: 'businessType' }) === 'INDIVIDUAL';

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await engagementService.apply(values);
      toast.success('Application submitted');
      onDone();
    } catch (error) {
      setFormError(
        applyApiError(error, setError, [
          'storeName',
          'legalName',
          'gstin',
          'contactPhone',
          'businessType',
        ]),
      );
    }
  });

  const p = errors.pickupAddress;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-6 rounded-xl border bg-card p-5 shadow-card sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Store className="size-5 text-primary" aria-hidden="true" /> Tell us about your business
      </h2>
      {!emailVerified ? (
        <Alert variant="warning">Verify your email address before applying.</Alert>
      ) : null}
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Store name"
          hint="Shown to shoppers"
          error={errors.storeName?.message}
          {...register('storeName')}
        />
        <SelectField
          label="Business type"
          options={BUSINESS_TYPES.map((b) => ({ value: b, label: BUSINESS_LABELS[b] }))}
          error={errors.businessType?.message}
          {...register('businessType')}
        />
        <TextField
          label="Legal name"
          hint="As on your PAN / registration"
          error={errors.legalName?.message}
          {...register('legalName')}
        />
        <TextField
          label={individual ? 'GSTIN (optional)' : 'GSTIN'}
          maxLength={15}
          className="uppercase"
          error={errors.gstin?.message}
          {...register('gstin')}
        />
        <TextField
          label="Business mobile"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          error={errors.contactPhone?.message}
          {...register('contactPhone')}
        />
      </div>
      <fieldset className="space-y-4">
        <legend className="font-medium">Pickup address</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Contact name"
            error={p?.fullName?.message}
            {...register('pickupAddress.fullName')}
          />
          <TextField
            label="Contact mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            error={p?.phone?.message}
            {...register('pickupAddress.phone')}
          />
          <TextField
            label="Address line 1"
            className="sm:col-span-2"
            error={p?.line1?.message}
            {...register('pickupAddress.line1')}
          />
          <TextField
            label="Address line 2 (optional)"
            className="sm:col-span-2"
            error={p?.line2?.message}
            {...register('pickupAddress.line2')}
          />
          <TextField label="City" error={p?.city?.message} {...register('pickupAddress.city')} />
          <TextField
            label="PIN code"
            inputMode="numeric"
            maxLength={6}
            error={p?.pincode?.message}
            {...register('pickupAddress.pincode')}
          />
          <SelectField
            label="State"
            placeholder="Choose a state"
            options={STATE_OPTIONS}
            error={p?.state?.message}
            {...register('pickupAddress.state')}
          />
        </div>
      </fieldset>
      <Button type="submit" loading={isSubmitting} disabled={!emailVerified}>
        Submit application
      </Button>
    </form>
  );
}
