'use client';

import type { NotificationPreferences } from '@zyventa/shared';
import { useId } from 'react';
import { toast } from '@/components/feedback/toast';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/cart/use-cart';
import { cn } from '@/lib/utils';
import { useProfile, useUpdatePreferences } from '../hooks/use-account';

const ITEMS: {
  key: keyof NotificationPreferences;
  title: string;
  text: string;
  locked?: boolean;
}[] = [
  {
    key: 'orderUpdates',
    title: 'Order updates',
    text: 'Confirmation, shipping and delivery emails.',
  },
  {
    key: 'stockAlerts',
    title: 'Back-in-stock alerts',
    text: 'When an item you asked about is available again.',
  },
  {
    key: 'promotions',
    title: 'Offers and deals',
    text: 'Occasional sales and personalised offers.',
  },
  {
    key: 'securityAlerts',
    title: 'Security alerts',
    text: 'New sign-ins and password changes. Always on to protect your account.',
    locked: true,
  },
];

export function NotificationSettings() {
  const profile = useProfile();
  const update = useUpdatePreferences();
  const prefs = profile.data?.notificationPreferences;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
        <p className="mt-1 text-muted-foreground">Choose which emails you receive.</p>
      </div>
      {profile.error ? (
        <Alert variant="error">We couldn’t load your preferences. Please refresh the page.</Alert>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-card">
          {ITEMS.map((item) => (
            <li key={item.key} className="p-4 sm:p-5">
              {prefs ? (
                <Toggle
                  title={item.title}
                  text={item.text}
                  checked={prefs[item.key]}
                  disabled={item.locked === true || update.isPending}
                  onChange={(checked) => {
                    if (item.key === 'securityAlerts') return;
                    update.mutate(
                      { [item.key]: checked },
                      {
                        onSuccess: () => {
                          toast.success('Preferences saved');
                        },
                        onError: (error) => {
                          toast.error(errorMessage(error, 'Could not save your preferences'));
                        },
                      },
                    );
                  }}
                />
              ) : (
                <Skeleton className="h-10" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({
  title,
  text,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-medium">
          {title}
        </label>
        <p id={`${id}-text`} className="mt-0.5 text-sm text-muted-foreground">
          {text}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-text`}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-5 rounded-full bg-card shadow transition-transform',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
