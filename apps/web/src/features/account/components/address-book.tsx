'use client';

import { INDIAN_STATES, MAX_ADDRESSES, type AddressView } from '@zyventa/shared';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/components/feedback/toast';
import { EmptyState } from '@/components/feedback/empty-state';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { useAddressMutations, useAddresses } from '../hooks/use-account';
import { AddressForm } from './address-form';

const stateName = (code: string) => INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
const LABEL_TEXT = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const;

type Editing = { mode: 'create' } | { mode: 'edit'; address: AddressView } | null;

export function AddressBook() {
  const addresses = useAddresses();
  const { create, update, setDefault, remove } = useAddressMutations();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<AddressView | null>(null);
  const list = addresses.data ?? [];
  const atLimit = list.length >= MAX_ADDRESSES;

  const addButton = (
    <Button
      onClick={() => {
        setEditing({ mode: 'create' });
      }}
      disabled={atLimit}
    >
      <Plus aria-hidden="true" /> Add address
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Addresses</h1>
          <p className="mt-1 text-muted-foreground">Where should we deliver your orders?</p>
        </div>
        {list.length > 0 ? addButton : null}
      </div>
      {atLimit ? (
        <Alert variant="info">
          You’ve saved the maximum of {MAX_ADDRESSES} addresses. Delete one to add another.
        </Alert>
      ) : null}

      {addresses.error ? (
        <Alert variant="error">We couldn’t load your addresses. Please refresh the page.</Alert>
      ) : addresses.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add an address now for a faster checkout."
          action={addButton}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map((address) => (
            <li
              key={address.id}
              className="flex flex-col rounded-xl border bg-card p-4 shadow-card sm:p-5"
            >
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{LABEL_TEXT[address.label]}</Badge>
                {address.isDefault ? <Badge variant="primary">Default</Badge> : null}
              </div>
              <address className="mt-3 flex-1 text-sm not-italic">
                <span className="font-semibold">{address.fullName}</span>
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}
                {address.landmark ? (
                  <>
                    <br />
                    Landmark: {address.landmark}
                  </>
                ) : null}
                <br />
                {address.city}, {stateName(address.state)} {address.pincode}
                <br />
                <span className="text-muted-foreground">Mobile: {address.phone}</span>
              </address>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing({ mode: 'edit', address });
                  }}
                  aria-label={`Edit address for ${address.fullName}, ${address.line1}`}
                >
                  <Pencil aria-hidden="true" /> Edit
                </Button>
                {!address.isDefault ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={setDefault.isPending && setDefault.variables === address.id}
                    onClick={() => {
                      setDefault.mutate(address.id, {
                        onError: (e) => {
                          toast.error(errorMessage(e));
                        },
                      });
                    }}
                  >
                    <Star aria-hidden="true" /> Set as default
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setDeleting(address);
                  }}
                  aria-label={`Delete address for ${address.fullName}, ${address.line1}`}
                >
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent
          side="right"
          title={editing?.mode === 'edit' ? 'Edit address' : 'Add a new address'}
        >
          {editing ? (
            <AddressForm
              key={editing.mode === 'edit' ? editing.address.id : 'new'}
              {...(editing.mode === 'edit' ? { address: editing.address } : {})}
              submitting={create.isPending || update.isPending}
              onSubmit={async (input) => {
                if (editing.mode === 'edit') {
                  await update.mutateAsync({ id: editing.address.id, input });
                  toast.success('Address updated');
                } else {
                  await create.mutateAsync(input);
                  toast.success('Address saved');
                }
                setEditing(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <SheetContent side="center" title="Delete this address?">
          <div className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              {deleting?.fullName}, {deleting?.line1}, {deleting?.city}
              {deleting?.isDefault ? ' — another saved address will become your default.' : ''}
            </p>
            <div className="flex justify-end gap-2">
              <SheetClose asChild>
                <Button variant="outline">Cancel</Button>
              </SheetClose>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => {
                  if (!deleting) return;
                  remove.mutate(deleting.id, {
                    onSuccess: () => {
                      toast.success('Address deleted');
                      setDeleting(null);
                    },
                    onError: (e) => {
                      toast.error(errorMessage(e));
                    },
                  });
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
