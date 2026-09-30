'use client';

import {
  INDIAN_STATES,
  payoutAccountInputSchema,
  sellerProfileUpdateSchema,
  type SellerProfileView,
} from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Lock, Store } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/dashboard-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/features/cart/use-cart';
import { sellerService } from '@/services/seller.service';

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name ?? code;

export function StoreSettings() {
  const profile = useQuery({ queryKey: ['seller', 'profile'], queryFn: sellerService.profile });
  if (profile.error) return <Alert variant="error">We couldn’t load your store profile.</Alert>;
  if (!profile.data) return <Skeleton className="h-96 rounded-xl" />;
  return (
    <>
      <PageHeader
        title="Store settings"
        description={`${profile.data.storeName} · commission ${String(profile.data.commissionBps / 100)}%`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm key={profile.data.id} profile={profile.data} />
        <PayoutForm profile={profile.data} />
      </div>
    </>
  );
}

function ProfileForm({ profile }: { profile: SellerProfileView }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(profile.description);
  const [supportEmail, setSupportEmail] = useState(profile.supportEmail ?? '');
  const [supportPhone, setSupportPhone] = useState(profile.supportPhone ?? '');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const parsed = sellerProfileUpdateSchema.safeParse({
        description,
        supportEmail,
        supportPhone,
      });
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('. '));
      return sellerService.updateProfile(parsed.data);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['seller', 'profile'], data);
      setError('');
      toast.success('Store profile saved');
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : errorMessage(e));
    },
  });
  const a = profile.pickupAddress;
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Store className="size-4 text-primary" aria-hidden="true" /> Store profile
      </h2>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Legal name</dt>
          <dd>{profile.legalName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">GSTIN</dt>
          <dd>{profile.gstin ?? '—'}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <Label htmlFor="s-desc">About your store</Label>
        <Textarea
          id="s-desc"
          maxLength={2000}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="s-email">Support email</Label>
          <Input
            id="s-email"
            type="email"
            value={supportEmail}
            onChange={(e) => {
              setSupportEmail(e.target.value);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-phone">Support mobile</Label>
          <Input
            id="s-phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={supportPhone}
            onChange={(e) => {
              setSupportPhone(e.target.value.replace(/\D/g, ''));
            }}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Pickup: {a.line1}, {a.city}, {stateName(a.state)} {a.pincode}
      </p>
      <Button type="submit" loading={save.isPending}>
        Save profile
      </Button>
    </form>
  );
}

function PayoutForm({ profile }: { profile: SellerProfileView }) {
  const queryClient = useQueryClient();
  const [holder, setHolder] = useState(
    profile.payoutAccount?.accountHolderName ?? profile.legalName,
  );
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState(profile.payoutAccount?.ifsc ?? '');
  const [bank, setBank] = useState(profile.payoutAccount?.bankName ?? '');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      const parsed = payoutAccountInputSchema.safeParse({
        accountHolderName: holder,
        accountNumber: account,
        ifsc,
        bankName: bank,
      });
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('. '));
      return sellerService.setPayoutAccount(parsed.data);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['seller', 'profile'], data);
      setAccount('');
      setError('');
      toast.success('Bank details saved');
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : errorMessage(e));
    },
  });
  return (
    <form
      className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Landmark className="size-4 text-primary" aria-hidden="true" /> Payout account
      </h2>
      {profile.payoutAccount ? (
        <p className="text-sm">
          Current: {profile.payoutAccount.bankName} •••• {profile.payoutAccount.accountNumberLast4}
        </p>
      ) : (
        <Alert variant="warning">Add bank details to receive payouts.</Alert>
      )}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="p-holder">Account holder name</Label>
        <Input
          id="p-holder"
          value={holder}
          onChange={(e) => {
            setHolder(e.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-acc">Account number</Label>
        <Input
          id="p-acc"
          inputMode="numeric"
          autoComplete="off"
          value={account}
          onChange={(e) => {
            setAccount(e.target.value.replace(/\D/g, '').slice(0, 18));
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-ifsc">IFSC</Label>
          <Input
            id="p-ifsc"
            className="uppercase"
            maxLength={11}
            value={ifsc}
            onChange={(e) => {
              setIfsc(e.target.value.toUpperCase());
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-bank">Bank name</Label>
          <Input
            id="p-bank"
            value={bank}
            onChange={(e) => {
              setBank(e.target.value);
            }}
          />
        </div>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden="true" /> Encrypted at rest. Only the last 4 digits are
        ever shown.
      </p>
      <Button type="submit" loading={save.isPending} disabled={!account}>
        Save bank details
      </Button>
    </form>
  );
}
